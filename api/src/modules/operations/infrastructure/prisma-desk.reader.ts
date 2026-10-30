import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { RoleCode } from '../../identity/domain/identity.codes';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { formatCents, totalCents } from '../../fulfillment/domain/collection';
import { COLLECTION_MOVEMENT, TRIP_STATUSES } from '../../fulfillment/domain/fulfillment.codes';
import { mergeTimeline, sortAlerts } from '../domain/desk';
import { DeskAlert } from '../domain/operations.codes';
import { DeskEvent, DeskOrder, DeskOrderDetail, DeskReader, OpenIncident, Person } from '../domain/ports/desk';

interface OrderRow {
  id: string;
  code: string;
  municipality_id: number;
  status: string;
  status_since: Date;
  created_at: Date;
  store_name: string;
  zone_name: string;
  customer_given: string;
  customer_family: string | null;
  customer_phone: string | null;
  courier_user_id: string | null;
  courier_given: string | null;
  courier_family: string | null;
  courier_phone: string | null;
  courier_holding: boolean | null;
  total: string;
  payment_method: string;
  alerts: { code: DeskAlert; since: string }[] | null;
  incident: { id: string; type: string; status: string; description: string | null; createdAt: string; reportedByRole: string; takenGiven: string | null; takenFamily: string | null } | null;
  cancellable: boolean;
}

const person = (givenNames: string, familyNames: string | null): Person => ({ givenNames, familyNames });

/**
 * Columnas de la lista (y del detalle). El domiciliario es el último que lo llevó (v_order_courier): después de una
 * entrega con foto ya no lo tiene, pero sigue siendo a quien hay que llamar. `holding`: aún lo tiene asignado.
 */
const ORDER_COLUMNS = (role: number) => Prisma.sql`
  o.id, o.code, e.municipality_id, s.code AS status, last.occurred_at AS status_since, o.created_at,
  e.name AS store_name, z.name AS zone_name,
  cp.given_names AS customer_given, cp.family_names AS customer_family, cph.phone_e164 AS customer_phone,
  oc.courier_user_id, rp.given_names AS courier_given, rp.family_names AS courier_family, rph.phone_e164 AS courier_phone,
  oc.released_at IS NULL AS courier_holding,
  a.customer_total::text AS total, pm.code AS payment_method,
  (SELECT json_agg(json_build_object('code', al.alert, 'since', al.since)) FROM v_active_order_alerts al WHERE al.order_id = o.id) AS alerts,
  (SELECT json_build_object('id', i.id, 'type', it.code, 'status', st.code, 'description', i.description, 'createdAt', i.created_at,
                            'reportedByRole', CASE WHEN i.reported_by_user_id = o.customer_user_id THEN 'CUSTOMER' ELSE 'STAFF' END,
                            'takenGiven', tp.given_names, 'takenFamily', tp.family_names)
   FROM incidents i
   JOIN incident_types it ON it.id = i.incident_type_id
   JOIN incident_statuses st ON st.id = i.status_id AND NOT st.is_terminal
   LEFT JOIN LATERAL (SELECT h.changed_by_user_id FROM incident_status_history h
                      WHERE h.incident_id = i.id AND h.from_status_id IS NOT NULL ORDER BY h.occurred_at DESC LIMIT 1) taken ON true
   LEFT JOIN users tu ON tu.id = taken.changed_by_user_id
   LEFT JOIN people tp ON tp.id = tu.person_id
   WHERE i.order_id = o.id LIMIT 1) AS incident,
  EXISTS (SELECT 1 FROM order_status_transition_roles tr JOIN order_statuses c ON c.id = tr.to_status_id AND c.code = ${TRIP_STATUSES.CANCELLED}
          WHERE tr.from_status_id = o.status_id AND tr.role_id = ${role}) AS cancellable`;

const ORDER_JOINS = Prisma.sql`
  JOIN order_statuses s ON s.id = o.status_id
  JOIN establishments e ON e.id = o.establishment_id
  JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
  JOIN delivery_zones z ON z.id = f.delivery_zone_id
  JOIN v_order_amounts a ON a.order_id = o.id
  JOIN payment_methods pm ON pm.id = o.payment_method_id
  JOIN users cu ON cu.id = o.customer_user_id
  JOIN people cp ON cp.id = cu.person_id
  LEFT JOIN person_phones cph ON cph.person_id = cp.id AND cph.is_primary
  LEFT JOIN v_order_courier oc ON oc.order_id = o.id
  LEFT JOIN users ru ON ru.id = oc.courier_user_id
  LEFT JOIN people rp ON rp.id = ru.person_id
  LEFT JOIN person_phones rph ON rph.person_id = rp.id AND rph.is_primary
  CROSS JOIN LATERAL (SELECT h.occurred_at FROM order_status_history h WHERE h.order_id = o.id ORDER BY h.recorded_at DESC LIMIT 1) last`;

function toOrder(r: OrderRow): DeskOrder {
  const incident: OpenIncident | null = r.incident
    ? {
        id: r.incident.id,
        type: r.incident.type,
        status: r.incident.status,
        description: r.incident.description,
        createdAt: new Date(r.incident.createdAt),
        reportedByRole: r.incident.reportedByRole,
        takenBy: r.incident.takenGiven ? person(r.incident.takenGiven, r.incident.takenFamily) : null,
      }
    : null;
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    statusSince: r.status_since,
    createdAt: r.created_at,
    establishment: { name: r.store_name },
    zoneName: r.zone_name,
    customer: { ...person(r.customer_given, r.customer_family), phone: r.customer_phone },
    courier: r.courier_user_id
      ? { userId: r.courier_user_id, ...person(r.courier_given!, r.courier_family), phone: r.courier_phone, holding: r.courier_holding === true }
      : null,
    total: r.total,
    paymentMethod: r.payment_method,
    alerts: sortAlerts((r.alerts ?? []).map((a) => ({ code: a.code, since: new Date(a.since) }))),
    incident,
    cancellable: r.cancellable,
  };
}

@Injectable()
export class PrismaDeskReader extends DeskReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async board(municipalityId: number, role: RoleCode): Promise<DeskOrder[]> {
    const roleId = await this.ids.of('roles', role);
    // Lo no terminado del municipio, más lo terminado que aún tiene una alerta (el cobro de las últimas 24 horas).
    const rows = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT ${ORDER_COLUMNS(roleId)}
      FROM orders o
      ${ORDER_JOINS}
      WHERE e.municipality_id = ${municipalityId}
        AND (NOT s.is_terminal OR EXISTS (SELECT 1 FROM v_active_order_alerts al WHERE al.order_id = o.id))`;
    return rows.map(toOrder);
  }

  async detail(code: string, role: RoleCode): Promise<(DeskOrderDetail & { municipalityId: number }) | null> {
    const roleId = await this.ids.of('roles', role);
    const [row] = await this.prisma.$queryRaw<
      (OrderRow & {
        items_total: string;
        delivery_fee: string;
        address_label: string | null;
        address_line: string | null;
        address_reference: string | null;
        lat: number;
        lng: number;
        customer_notes: string | null;
        purchase_amount: string | null;
        receipt_file_id: string | null;
        proof_file_id: string | null;
        proof_captured_at: Date | null;
        proof_distance: number | null;
        cancel_reason: string | null;
        cancel_notes: string | null;
      })[]
    >`
      SELECT ${ORDER_COLUMNS(roleId)},
             a.items_total::text AS items_total, a.delivery_fee::text AS delivery_fee,
             ad.label AS address_label, ad.line AS address_line, ad.reference AS address_reference,
             ST_Y(ad.location::geometry) AS lat, ST_X(ad.location::geometry) AS lng, o.customer_notes,
             mv.amount::text AS purchase_amount, op.receipt_file_id,
             dp.file_id AS proof_file_id, pf.captured_at AS proof_captured_at,
             round(ST_Distance(pf.captured_location, ad.location))::int AS proof_distance,
             cr.code AS cancel_reason, ocl.notes AS cancel_notes
      FROM orders o
      ${ORDER_JOINS}
      JOIN addresses ad ON ad.id = o.delivery_address_id
      LEFT JOIN order_purchases op ON op.order_id = o.id
      LEFT JOIN cash_movements mv ON mv.id = op.cash_movement_id
      LEFT JOIN order_delivery_proofs dp ON dp.order_id = o.id
      LEFT JOIN files pf ON pf.id = dp.file_id
      LEFT JOIN order_cancellations ocl ON ocl.order_id = o.id
      LEFT JOIN cancellation_reasons cr ON cr.id = ocl.cancellation_reason_id
      WHERE o.code = ${code}`;
    if (!row) return null;

    const [lines, timeline, collections] = await Promise.all([this.lines(row.id), this.timeline(row.id), this.collections(row.id)]);
    return {
      ...toOrder(row),
      municipalityId: row.municipality_id,
      lines,
      amounts: { items: row.items_total, deliveryFee: row.delivery_fee, total: row.total },
      delivery: { label: row.address_label, line: row.address_line, reference: row.address_reference, location: GeoPoint.create(row.lat, row.lng) },
      notes: row.customer_notes,
      purchase: row.purchase_amount && row.receipt_file_id ? { amount: row.purchase_amount, receiptFileId: row.receipt_file_id } : null,
      proof: row.proof_file_id ? { fileId: row.proof_file_id, capturedAt: row.proof_captured_at, distanceMeters: row.proof_distance } : null,
      collection: collections.length ? { total: formatCents(totalCents(collections)), payments: collections } : null,
      cancellation: row.cancel_reason ? { reason: row.cancel_reason, notes: row.cancel_notes } : null,
      timeline,
    };
  }

  async cancellationReasons(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM cancellation_reasons WHERE NOT is_automatic AND NOT is_merchant_reason AND deactivated_at IS NULL ORDER BY sort_order`;
    return rows.map((r) => r.code);
  }

  async orderScope(code: string): Promise<{ code: string; municipalityId: number } | null> {
    const [row] = await this.prisma.$queryRaw<{ code: string; municipalityId: number }[]>`
      SELECT o.code, e.municipality_id AS "municipalityId" FROM orders o JOIN establishments e ON e.id = o.establishment_id WHERE o.code = ${code}`;
    return row ?? null;
  }

  async incidentScope(incidentId: string): Promise<{ orderCode: string; municipalityId: number } | null> {
    const [row] = await this.prisma.$queryRaw<{ orderCode: string; municipalityId: number }[]>`
      SELECT o.code AS "orderCode", e.municipality_id AS "municipalityId"
      FROM incidents i JOIN orders o ON o.id = i.order_id JOIN establishments e ON e.id = o.establishment_id
      WHERE i.id = ${incidentId}::uuid`;
    return row ?? null;
  }

  /** Todas las líneas en español (el panel es del personal), también las quitadas o cambiadas en E09. */
  private lines(orderId: string) {
    return this.prisma.$queryRaw<{ name: string; quantity: number; unitPrice: string; removed: boolean }[]>`
      SELECT t.name, l.quantity::int AS quantity, l.unit_price::text AS "unitPrice", l.is_removed AS removed
      FROM v_order_lines l
      JOIN languages es ON es.code = 'es'
      JOIN product_version_texts t ON t.product_version_id = l.product_version_id AND t.language_id = es.id
      WHERE l.order_id = ${orderId}::uuid
      ORDER BY l.is_removed, l.unit_price * l.quantity DESC, t.name`;
  }

  private collections(orderId: string) {
    return this.prisma.$queryRaw<{ paymentMethod: string; amount: string; at: Date }[]>`
      SELECT pm.code AS "paymentMethod", m.amount::text AS amount, m.created_at AS at
      FROM cash_movements m
      JOIN cash_movement_types t ON t.id = m.movement_type_id AND t.code = ${COLLECTION_MOVEMENT}
      JOIN payment_methods pm ON pm.id = m.payment_method_id
      WHERE m.order_id = ${orderId}::uuid
      ORDER BY m.created_at`;
  }

  /** La línea de tiempo (H10.5): cada tabla dice lo suyo y aquí se une, sin copiar nada en otra tabla. */
  private async timeline(orderId: string): Promise<DeskEvent[]> {
    const [statuses, offers, releases, delays, adjustments, attempts, collections, incidents] = await Promise.all([
      this.prisma.$queryRaw<{ at: Date; from: string | null; to: string; given: string | null; family: string | null; role: string | null; source: string; note: string | null }[]>`
        SELECT h.occurred_at AS at, fs.code AS from, ts.code AS to, p.given_names AS given, p.family_names AS family, r.code AS role,
               src.code AS source, h.note
        FROM order_status_history h
        JOIN order_statuses ts ON ts.id = h.to_status_id
        LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
        JOIN status_change_sources src ON src.id = h.source_id
        LEFT JOIN users u ON u.id = h.changed_by_user_id
        LEFT JOIN people p ON p.id = u.person_id
        LEFT JOIN roles r ON r.id = h.acting_role_id
        WHERE h.order_id = ${orderId}::uuid
        ORDER BY h.recorded_at`,
      this.prisma.$queryRaw<{ at: Date; mode: string; given: string | null; family: string | null; recipients: { given: string; family: string | null; status: string; respondedAt: string | null }[] }[]>`
        SELECT oo.created_at AS at, m.code AS mode, p.given_names AS given, p.family_names AS family,
               (SELECT json_agg(json_build_object('given', rp.given_names, 'family', rp.family_names, 'status', rs.code, 'respondedAt', r.responded_at)
                                ORDER BY r.responded_at NULLS LAST)
                FROM order_offer_recipients r
                JOIN offer_recipient_statuses rs ON rs.id = r.status_id
                JOIN users ru ON ru.id = r.courier_user_id
                JOIN people rp ON rp.id = ru.person_id
                WHERE r.order_offer_id = oo.id) AS recipients
        FROM order_offers oo
        JOIN offer_modes m ON m.id = oo.offer_mode_id
        LEFT JOIN users u ON u.id = oo.sent_by_user_id
        LEFT JOIN people p ON p.id = u.person_id
        WHERE oo.order_id = ${orderId}::uuid`,
      // Las liberaciones que no son el fin normal del pedido (soltó el pedido, lo reasignaron).
      this.prisma.$queryRaw<{ at: Date; given: string; family: string | null; reason: string; by_given: string | null; by_family: string | null }[]>`
        SELECT a.released_at AS at, cp.given_names AS given, cp.family_names AS family, rr.code AS reason,
               bp.given_names AS by_given, bp.family_names AS by_family
        FROM order_assignments a
        JOIN assignment_release_reasons rr ON rr.id = a.release_reason_id AND rr.code NOT IN ('ORDER_COMPLETED', 'ORDER_CANCELLED')
        JOIN users cu ON cu.id = a.courier_user_id
        JOIN people cp ON cp.id = cu.person_id
        LEFT JOIN users bu ON bu.id = a.released_by_user_id
        LEFT JOIN people bp ON bp.id = bu.person_id
        WHERE a.order_id = ${orderId}::uuid AND a.released_at IS NOT NULL`,
      this.prisma.$queryRaw<{ at: Date }[]>`SELECT reported_at AS at FROM order_preparation_delays WHERE order_id = ${orderId}::uuid`,
      this.prisma.$queryRaw<{ at: Date; expires_at: Date; lines: { name: string; reason: string; decision: string | null; decidedAt: string | null }[] }[]>`
        SELECT req.reported_at AS at, req.expires_at,
               (SELECT json_agg(json_build_object('name', t.name, 'reason', ar.code, 'decision', d.code, 'decidedAt', x.decided_at))
                FROM order_item_adjustments x
                JOIN adjustment_reasons ar ON ar.id = x.reason_id
                LEFT JOIN adjustment_decisions d ON d.id = x.decision_id
                JOIN order_items i ON i.id = x.order_item_id
                JOIN languages es ON es.code = 'es'
                JOIN product_version_texts t ON t.product_version_id = i.product_version_id AND t.language_id = es.id
                WHERE x.request_id = req.id) AS lines
        FROM order_adjustment_requests req WHERE req.order_id = ${orderId}::uuid`,
      this.prisma.$queryRaw<{ at: Date }[]>`SELECT attempted_at AS at FROM delivery_code_attempts WHERE order_id = ${orderId}::uuid ORDER BY attempted_at`,
      this.collections(orderId),
      this.prisma.$queryRaw<{ at: Date; id: string; status: string; type: string; given: string; family: string | null; role: string; resolution: string | null; note: string | null }[]>`
        SELECT h.occurred_at AS at, i.id, st.code AS status, it.code AS type, p.given_names AS given, p.family_names AS family,
               CASE WHEN h.changed_by_user_id = o.customer_user_id THEN 'CUSTOMER' ELSE 'STAFF' END AS role,
               CASE WHEN st.is_terminal THEN rt.code END AS resolution,
               CASE WHEN st.is_terminal THEN i.resolution_notes WHEN h.from_status_id IS NULL THEN i.description END AS note
        FROM incident_status_history h
        JOIN incidents i ON i.id = h.incident_id
        JOIN orders o ON o.id = i.order_id
        JOIN incident_statuses st ON st.id = h.to_status_id
        JOIN incident_types it ON it.id = i.incident_type_id
        LEFT JOIN incident_resolution_types rt ON rt.id = i.resolution_type_id
        JOIN users u ON u.id = h.changed_by_user_id
        JOIN people p ON p.id = u.person_id
        WHERE i.order_id = ${orderId}::uuid
        ORDER BY h.occurred_at`,
    ]);

    // En el mismo instante, la novedad va antes del cambio de estado que provoca (o después del que la cierra).
    return mergeTimeline<DeskEvent>(
      incidents.map((i) => ({
        kind: 'INCIDENT' as const,
        at: i.at,
        seq: i.status === 'RESOLVED' ? 1 : 0,
        incidentId: i.id,
        status: i.status,
        type: i.type,
        by: { ...person(i.given, i.family), role: i.role },
        resolution: i.resolution,
        note: i.note,
      })),
      statuses.map((h) => ({
        kind: 'STATUS' as const,
        at: h.at,
        seq: h.from === TRIP_STATUSES.DISPUTED ? 2 : 0,
        from: h.from,
        to: h.to,
        actor: h.given ? { ...person(h.given, h.family), role: h.role ?? '' } : null,
        source: h.source,
        note: h.note,
      })),
      offers.map((o) => ({
        kind: 'OFFER' as const,
        at: o.at,
        mode: o.mode,
        sentBy: o.given ? person(o.given, o.family) : null,
        recipients: (o.recipients ?? []).map((r) => ({ name: person(r.given, r.family), status: r.status, respondedAt: r.respondedAt ? new Date(r.respondedAt) : null })),
      })),
      releases.map((r) => ({
        kind: 'RELEASE' as const,
        at: r.at,
        courier: person(r.given, r.family),
        reason: r.reason,
        by: r.by_given ? person(r.by_given, r.by_family) : null,
      })),
      delays.map((d) => ({ kind: 'DELAY' as const, at: d.at })),
      adjustments.map((a) => ({
        kind: 'ADJUSTMENT' as const,
        at: a.at,
        expiresAt: a.expires_at,
        lines: (a.lines ?? []).map((l) => ({ name: l.name, reason: l.reason, decision: l.decision, decidedAt: l.decidedAt ? new Date(l.decidedAt) : null })),
      })),
      attempts.map((a) => ({ kind: 'CODE_ATTEMPT' as const, at: a.at })),
      collections.map((c) => ({ kind: 'COLLECTION' as const, at: c.at, paymentMethod: c.paymentMethod, amount: c.amount })),
    );
  }
}
