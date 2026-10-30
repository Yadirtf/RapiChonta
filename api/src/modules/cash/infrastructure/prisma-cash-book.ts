import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { CatalogIds } from '../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CASH_MOVEMENTS } from '../domain/cash.codes';
import { CashBook, CashWriteRefusal, CashWriteResult } from '../domain/ports/cash-boxes';

/** Los rechazos de los disparadores empiezan con su código (migración 20261030000000_cash_boxes_e11). */
const REFUSALS: [string, CashWriteRefusal][] = [
  ['CASH_BOX_CLOSED', 'CLOSED'],
  ['cash_box_closures_pkey', 'CLOSED'],
  ['CASH_BOX_ALREADY_OPENED', 'ALREADY_OPENED'],
  ['CASH_BOX_FUNDING_MODE', 'NO_BASE_MODE'],
  ['CASH_BOX_COURIER_BUSY', 'BUSY'],
  ['CASH_NOTE_REQUIRED', 'NOTE'],
  ['CASH_REVERSAL_INVALID', 'REVERSAL'],
  // Una segunda anulación del mismo movimiento choca con el UNIQUE de reverses_movement_id.
  ['cash_movements_reverses_movement_id_key', 'REVERSAL'],
];

class Refused extends Error {
  constructor(readonly reason: CashWriteRefusal) {
    super(reason);
  }
}

function refusalOf(error: unknown): CashWriteRefusal | null {
  if (error instanceof Refused) return error.reason;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const text = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return REFUSALS.find(([needle]) => text.includes(needle))?.[1] ?? null;
}

/** Las escrituras del libro: la base de la caja, los ajustes y el cierre con lo que entregó el domiciliario. */
@Injectable()
export class PrismaCashBook extends CashBook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
  }

  /**
   * H11.1: la base del día. La caja de esa fecha puede existir ya (una compra o un cobro tardío la crean); si no, nace
   * aquí. Por un medio de cuenta, la base lleva la cuenta del domiciliario a la que se le envió.
   */
  async open(input: { courierUserId: string; businessDate: string; amount: string; paymentMethod: string; note: string | null; actorUserId: string }) {
    const opening = await this.ids.of('cash_movement_types', CASH_MOVEMENTS.OPENING);
    return this.write(async (tx) => {
      const [box] = await tx.$queryRaw<{ id: string }[]>`
        WITH created AS (
          INSERT INTO cash_boxes (courier_user_id, business_date) VALUES (${input.courierUserId}::uuid, ${input.businessDate}::date)
          ON CONFLICT (courier_user_id, business_date) DO NOTHING RETURNING id)
        SELECT id FROM created
        UNION ALL
        SELECT id FROM cash_boxes WHERE courier_user_id = ${input.courierUserId}::uuid AND business_date = ${input.businessDate}::date
        LIMIT 1`;
      const [method] = await tx.$queryRaw<{ id: number; account_based: boolean; account_id: string | null }[]>`
        SELECT pm.id, pm.is_account_based AS account_based, a.id AS account_id
        FROM payment_methods pm
        LEFT JOIN courier_collection_accounts a
          ON a.payment_method_id = pm.id AND a.courier_user_id = ${input.courierUserId}::uuid AND a.archived_at IS NULL
        WHERE pm.code = ${input.paymentMethod}`;
      if (method.account_based && !method.account_id) throw new Refused('NO_ACCOUNT');
      await tx.$executeRaw`
        INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, payment_method_id, collection_account_id, created_by_user_id, note)
        VALUES (${box.id}::uuid, ${opening}, ${input.amount}::numeric, ${method.id}, ${method.account_based ? method.account_id : null}::uuid,
                ${input.actorUserId}::uuid, ${input.note})`;
      return { boxId: box.id };
    });
  }

  /** Un ajuste firmado; si anula otro movimiento, la base exige el sentido contrario y el mismo monto. */
  async adjust(input: { boxId: string; direction: 1 | -1; amount: string; note: string; reversesMovementId: string | null; actorUserId: string }) {
    const type = await this.ids.of('cash_movement_types', input.direction === 1 ? CASH_MOVEMENTS.ADJUSTMENT_IN : CASH_MOVEMENTS.ADJUSTMENT_OUT);
    return this.write(async (tx) => {
      const [movement] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, reverses_movement_id, created_by_user_id, note)
        VALUES (${input.boxId}::uuid, ${type}, ${input.amount}::numeric, ${input.reversesMovementId}::uuid, ${input.actorUserId}::uuid, ${input.note})
        RETURNING id`;
      return { movementId: movement.id };
    });
  }

  /**
   * H11.3: lo que entregó el domiciliario (un RETURN por medio) y el cierre, en la misma transacción. El disparador del
   * cierre toma la caja FOR UPDATE, rechaza con un pedido en curso y exige la nota si queda diferencia.
   */
  async close(input: { boxId: string; received: { paymentMethod: string; amount: string }[]; notes: string | null; actorUserId: string }) {
    const returned = await this.ids.of('cash_movement_types', CASH_MOVEMENTS.RETURN);
    return this.write(async (tx) => {
      if (input.received.length) {
        await tx.$executeRaw`
          INSERT INTO cash_movements (cash_box_id, movement_type_id, amount, payment_method_id, created_by_user_id)
          SELECT ${input.boxId}::uuid, ${returned}, x.amount, pm.id, ${input.actorUserId}::uuid
          FROM unnest(${input.received.map((r) => r.paymentMethod)}::text[], ${input.received.map((r) => r.amount)}::numeric[]) AS x(method, amount)
          JOIN payment_methods pm ON pm.code = x.method`;
      }
      await tx.$executeRaw`
        INSERT INTO cash_box_closures (cash_box_id, closed_by_user_id, notes) VALUES (${input.boxId}::uuid, ${input.actorUserId}::uuid, ${input.notes})`;
      return {};
    });
  }

  private async write<T extends object>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<CashWriteResult<T>> {
    try {
      return { ok: true as const, ...(await this.prisma.$transaction(work)) };
    } catch (error) {
      const reason = refusalOf(error);
      if (reason) return { ok: false, reason };
      throw error;
    }
  }
}
