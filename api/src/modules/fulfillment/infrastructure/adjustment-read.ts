import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AdjustmentReasonCode, decisionOptions, DecisionRule } from '../domain/adjustments';
import { AdjustmentReader, AdjustmentRequestView } from '../domain/ports/adjustments';

type Db = Prisma.TransactionClient | PrismaClient | PrismaService;

/** El catálogo de decisiones con lo que hace cada una (pocas filas, de sistema). */
export async function decisionRules(db: Db): Promise<DecisionRule[]> {
  return db.$queryRaw<DecisionRule[]>`
    SELECT code, removes_item AS "removesItem", uses_reported_price AS "usesReportedPrice", creates_substitute AS "createsSubstitute",
           cancels_order AS "cancelsOrder", is_automatic AS "isAutomatic"
    FROM adjustment_decisions WHERE deactivated_at IS NULL ORDER BY sort_order`;
}

/** Nombre de una versión en el idioma pedido, con respaldo a español (las vistas no reciben el idioma). */
const versionName = (versionColumn: Prisma.Sql, language: string) => Prisma.sql`
  (SELECT coalesce(tl.name, te.name) FROM product_version_texts te
   JOIN languages les ON les.id = te.language_id AND les.code = 'es'
   LEFT JOIN product_version_texts tl ON tl.product_version_id = te.product_version_id
     AND tl.language_id = (SELECT id FROM languages WHERE code = ${language})
   WHERE te.product_version_id = ${versionColumn})`;

/**
 * Las consultas de un pedido (la más reciente primero) con sus líneas, la decisión de cada una y la línea que la
 * reemplazó. Lo usan el pedido del cliente y el pedido en curso del domiciliario; nada se copia.
 */
export async function readOrderAdjustments(db: Db, orderId: string, language: string): Promise<AdjustmentRequestView[]> {
  const [rows, rules] = await Promise.all([
    db.$queryRaw<
      {
        request_id: string;
        reported_at: Date;
        expires_at: Date;
        id: string;
        order_item_id: string;
        name: string;
        quantity: number;
        unit_price: string;
        reason: AdjustmentReasonCode;
        requires_price: boolean;
        reported_unit_price: string | null;
        decision: string | null;
        decided_at: Date | null;
        substitute_name: string | null;
        substitute_quantity: number | null;
        substitute_price: string | null;
      }[]
    >`
      SELECT req.id AS request_id, req.reported_at, req.expires_at,
             x.id, x.order_item_id, ${versionName(Prisma.sql`i.product_version_id`, language)} AS name, i.quantity::int AS quantity,
             v.price::text AS unit_price, r.code AS reason, r.requires_price, x.reported_unit_price::text AS reported_unit_price,
             d.code AS decision, x.decided_at,
             ${versionName(Prisma.sql`si.product_version_id`, language)} AS substitute_name, si.quantity::int AS substitute_quantity,
             sv.price::text AS substitute_price
      FROM order_adjustment_requests req
      JOIN order_item_adjustments x ON x.request_id = req.id
      JOIN order_items i ON i.id = x.order_item_id
      JOIN product_versions v ON v.id = i.product_version_id
      JOIN adjustment_reasons r ON r.id = x.reason_id
      LEFT JOIN adjustment_decisions d ON d.id = x.decision_id
      LEFT JOIN order_items si ON si.origin_adjustment_id = x.id
      LEFT JOIN product_versions sv ON sv.id = si.product_version_id
      WHERE req.order_id = ${orderId}::uuid
      ORDER BY req.reported_at DESC, v.price * i.quantity DESC, x.id`,
    decisionRules(db),
  ]);

  const requests = new Map<string, AdjustmentRequestView>();
  for (const row of rows) {
    let request = requests.get(row.request_id);
    if (!request) {
      request = { id: row.request_id, reportedAt: row.reported_at, expiresAt: row.expires_at, open: false, lines: [] };
      requests.set(row.request_id, request);
    }
    if (!row.decided_at) request.open = true;
    request.lines.push({
      id: row.id,
      orderItemId: row.order_item_id,
      name: row.name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      reason: row.reason,
      reportedUnitPrice: row.reported_unit_price,
      decision: row.decision,
      decidedAt: row.decided_at,
      substitute:
        row.substitute_name && row.substitute_quantity && row.substitute_price
          ? { name: row.substitute_name, quantity: row.substitute_quantity, unitPrice: row.substitute_price }
          : null,
      options: row.decided_at ? [] : decisionOptions(rules, row.requires_price),
    });
  }
  return [...requests.values()];
}

@Injectable()
export class PrismaAdjustmentReader extends AdjustmentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  forOrder(orderId: string, language: string): Promise<AdjustmentRequestView[]> {
    return readOrderAdjustments(this.prisma, orderId, language);
  }
}
