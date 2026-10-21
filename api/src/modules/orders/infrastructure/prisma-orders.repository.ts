import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ContentLanguage } from '../../catalog/domain/catalog.codes';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { FULFILLMENT_MODES, STATUS_CHANGE_SOURCES } from '../domain/orders.codes';
import { ClientRequestReplayed, NewOrder, OrderCodeTaken, OrderDetail, OrdersRepository, OrderSummary } from '../domain/ports/orders.repository';
import { insertAddress } from './address-sql';

type Tx = Prisma.TransactionClient;

interface SummaryRow {
  id: string;
  code: string;
  created_at: Date;
  establishment_id: string;
  establishment_name: string;
  logo_file_id: string | null;
  status_code: string;
  status_at: Date;
  is_terminal: boolean;
  total: string;
  item_count: number;
}

/** Resumen de Mis pedidos: el estado es el último visible para el cliente, y los montos vienen de las vistas. */
const SUMMARY_SELECT = Prisma.sql`
  SELECT o.id, o.code, o.created_at, e.id AS establishment_id, e.name AS establishment_name, e.logo_file_id,
         vs.status_code, vs.occurred_at AS status_at, cs.is_terminal,
         a.customer_total::text AS total,
         (SELECT coalesce(sum(l.quantity), 0)::int FROM v_order_lines l WHERE l.order_id = o.id AND NOT l.is_removed) AS item_count
  FROM orders o
  JOIN order_statuses cs ON cs.id = o.status_id
  JOIN establishments e ON e.id = o.establishment_id
  JOIN v_order_amounts a ON a.order_id = o.id
  JOIN v_order_customer_status vs ON vs.order_id = o.id`;

const toSummary = (r: SummaryRow): OrderSummary => ({
  code: r.code,
  establishment: { id: r.establishment_id, name: r.establishment_name, logoFileId: r.logo_file_id },
  createdAt: r.created_at,
  status: { code: r.status_code, at: r.status_at, terminal: r.is_terminal },
  itemCount: r.item_count,
  total: r.total,
});

/** Un índice único violado dentro de $queryRaw llega como P2010 con el nombre de la restricción en el texto. */
const violates = (error: unknown, constraint: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes('23505') && error.message.includes(constraint);

@Injectable()
export class PrismaOrdersRepository extends OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  async create(order: NewOrder): Promise<void> {
    try {
      await this.prisma.$transaction((tx) => this.insert(tx, order), { timeout: 15_000 });
    } catch (error) {
      if (violates(error, 'orders_code_key')) throw new OrderCodeTaken();
      if (violates(error, 'order_status_history_client_event_id_key')) {
        const existing = await this.findByClientRequest(order.clientRequestId);
        if (existing) throw new ClientRequestReplayed(existing);
      }
      throw error;
    }
  }

  /**
   * Orden de la transacción (Docs/14 E04): dirección y destinatario si son nuevos, el pedido en el estado
   * inicial, sus líneas y la primera fila del historial. Los disparadores diferidos exigen líneas e historial.
   */
  private async insert(tx: Tx, order: NewOrder): Promise<void> {
    const [paymentMethodId, fulfillmentModeId, sourceId, customerRoleId] = await Promise.all([
      this.ids.of('payment_methods', order.paymentMethod, tx),
      this.ids.of('fulfillment_modes', FULFILLMENT_MODES.COURIER_PURCHASE, tx),
      this.ids.of('status_change_sources', STATUS_CHANGE_SOURCES.USER_ACTION, tx),
      this.ids.of('roles', 'CUSTOMER', tx),
    ]);
    const addressId = 'id' in order.address ? order.address.id : (await insertAddress(tx, order.customerUserId, order.address)).id;
    const recipientId = await this.recipient(tx, order);

    const [created] = await tx.$queryRaw<{ id: string; status_id: number }[]>`
      INSERT INTO orders (code, customer_user_id, establishment_id, delivery_address_id, recipient_id, delivery_zone_fee_id,
                          commission_rate_id, payment_method_id, fulfillment_mode_id, status_id, customer_notes)
      SELECT ${order.code}, ${order.customerUserId}::uuid, ${order.establishmentId}::uuid, ${addressId}::uuid, ${recipientId}::uuid,
             ${order.deliveryZoneFeeId}::uuid, ${order.commissionRateId}::uuid, ${paymentMethodId}, ${fulfillmentModeId}, s.id, ${order.customerNotes}
      FROM order_statuses s WHERE s.is_initial AND s.deactivated_at IS NULL
      RETURNING id, status_id`;

    await tx.$executeRaw`
      INSERT INTO order_items (order_id, product_version_id, quantity, notes)
      SELECT ${created.id}::uuid, l.product_version_id, l.quantity, l.notes
      FROM unnest(${order.lines.map((l) => l.productVersionId)}::uuid[], ${order.lines.map((l) => l.quantity)}::int[],
                  ${order.lines.map((l) => l.notes)}::text[]) AS l(product_version_id, quantity, notes)`;

    await tx.$executeRaw`
      INSERT INTO order_status_history (order_id, to_status_id, changed_by_user_id, acting_role_id, source_id, client_event_id)
      VALUES (${created.id}::uuid, ${created.status_id}, ${order.customerUserId}::uuid, ${customerRoleId}, ${sourceId}, ${order.clientRequestId}::uuid)`;
  }

  /** Un destinatario nuevo con el mismo teléfono reemplaza al guardado si cambió el nombre (son inmutables). */
  private async recipient(tx: Tx, order: NewOrder): Promise<string | null> {
    const input = order.recipient;
    if (!input) return null;
    if ('id' in input) return input.id;
    const [existing] = await tx.$queryRaw<{ id: string; full_name: string }[]>`
      SELECT id, full_name FROM customer_recipients
      WHERE owner_user_id = ${order.customerUserId}::uuid AND phone_e164 = ${input.phoneE164} AND archived_at IS NULL FOR UPDATE`;
    if (existing?.full_name === input.fullName) return existing.id;
    if (existing) await tx.$executeRaw`UPDATE customer_recipients SET archived_at = now() WHERE id = ${existing.id}::uuid`;
    const [created] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO customer_recipients (owner_user_id, full_name, phone_e164)
      VALUES (${order.customerUserId}::uuid, ${input.fullName}, ${input.phoneE164}) RETURNING id`;
    return created.id;
  }

  async findByClientRequest(clientRequestId: string): Promise<{ code: string; customerUserId: string } | null> {
    const [row] = await this.prisma.$queryRaw<{ code: string; customer_user_id: string }[]>`
      SELECT o.code, o.customer_user_id FROM order_status_history h JOIN orders o ON o.id = h.order_id
      WHERE h.client_event_id = ${clientRequestId}::uuid AND h.from_status_id IS NULL`;
    return row ? { code: row.code, customerUserId: row.customer_user_id } : null;
  }

  async listMine(customerUserId: string, query: { active: boolean; before?: Date; limit: number }): Promise<OrderSummary[]> {
    const before = query.before ? Prisma.sql`AND o.created_at < ${query.before}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      ${SUMMARY_SELECT}
      WHERE o.customer_user_id = ${customerUserId}::uuid AND cs.is_terminal = ${!query.active} ${before}
      ORDER BY o.created_at DESC
      LIMIT ${query.limit}`;
    return rows.map(toSummary);
  }

  async findMine(customerUserId: string, code: string, language: ContentLanguage): Promise<OrderDetail | null> {
    const [row] = await this.prisma.$queryRaw<
      (SummaryRow & {
        items_total: string;
        delivery_fee: string;
        zone_name: string;
        zone_kind: string;
        address_label: string | null;
        address_line: string | null;
        address_reference: string | null;
        latitude: number;
        longitude: number;
        recipient_name: string | null;
        recipient_phone: string | null;
        payment_method: string;
        customer_notes: string | null;
      })[]
    >`
      SELECT s.*, a.items_total::text AS items_total, a.delivery_fee::text AS delivery_fee,
             z.name AS zone_name, zk.code AS zone_kind,
             ad.label AS address_label, ad.line AS address_line, ad.reference AS address_reference,
             ST_Y(ad.location::geometry) AS latitude, ST_X(ad.location::geometry) AS longitude,
             r.full_name AS recipient_name, r.phone_e164 AS recipient_phone,
             pm.code AS payment_method, o.customer_notes
      FROM (${SUMMARY_SELECT} WHERE o.customer_user_id = ${customerUserId}::uuid AND o.code = ${code}) s
      JOIN orders o ON o.id = s.id
      JOIN v_order_amounts a ON a.order_id = o.id
      JOIN delivery_zone_fees f ON f.id = o.delivery_zone_fee_id
      JOIN delivery_zones z ON z.id = f.delivery_zone_id
      JOIN zone_kinds zk ON zk.id = z.zone_kind_id
      JOIN addresses ad ON ad.id = o.delivery_address_id
      LEFT JOIN customer_recipients r ON r.id = o.recipient_id
      JOIN payment_methods pm ON pm.id = o.payment_method_id`;
    if (!row) return null;

    const [lines, timeline, journey] = await Promise.all([
      this.prisma.$queryRaw<{ product_id: string; name: string; unit_price: string; quantity: number; notes: string | null; prep_minutes: number }[]>`
        SELECT l.product_id, COALESCE(tl.name, te.name) AS name, l.unit_price::text AS unit_price, l.quantity, l.notes, l.prep_minutes
        FROM v_order_lines l
        JOIN languages les ON les.code = 'es'
        LEFT JOIN languages ll ON ll.code = ${language}
        JOIN product_version_texts te ON te.product_version_id = l.product_version_id AND te.language_id = les.id
        LEFT JOIN product_version_texts tl ON tl.product_version_id = l.product_version_id AND tl.language_id = ll.id
        WHERE l.order_id = ${row.id}::uuid AND NOT l.is_removed
        ORDER BY l.unit_price * l.quantity DESC, name`,
      this.prisma.$queryRaw<{ code: string; at: Date }[]>`
        SELECT s.code, h.occurred_at AS at FROM order_status_history h
        JOIN order_statuses s ON s.id = h.to_status_id AND s.is_visible_to_customer
        WHERE h.order_id = ${row.id}::uuid ORDER BY h.recorded_at`,
      this.journey(),
    ]);

    return {
      ...toSummary(row),
      lines: lines.map((l) => ({ productId: l.product_id, name: l.name, unitPrice: l.unit_price, quantity: l.quantity, notes: l.notes })),
      amounts: { items: row.items_total, deliveryFee: row.delivery_fee, total: row.total },
      prepMinutes: Math.max(0, ...lines.map((l) => l.prep_minutes)),
      zone: { name: row.zone_name, kind: row.zone_kind },
      address: { label: row.address_label, line: row.address_line, reference: row.address_reference, location: GeoPoint.create(row.latitude, row.longitude) },
      recipient: row.recipient_name ? { fullName: row.recipient_name, phoneE164: row.recipient_phone } : null,
      paymentMethod: row.payment_method,
      customerNotes: row.customer_notes,
      // Si volvió a "Buscando domiciliario" (nadie aceptó la oferta), se ve una vez, desde la primera hora.
      timeline: collapse(timeline),
      journey,
    };
  }

  async journey(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM order_statuses WHERE is_milestone AND deactivated_at IS NULL ORDER BY sort_order`;
    return rows.map((r) => r.code);
  }
}

/** Deja una entrada por estado consecutivo: PENDING → (OFFERED oculto) → PENDING se ve una sola vez. */
function collapse(rows: { code: string; at: Date }[]): { code: string; at: Date }[] {
  const out: { code: string; at: Date }[] = [];
  for (const row of rows) {
    if (out[out.length - 1]?.code !== row.code) out.push(row);
  }
  return out;
}
