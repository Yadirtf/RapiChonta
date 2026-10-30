import { Injectable } from '@nestjs/common';
import { MunicipalityScope } from '../../business-config/application/municipality-scope';
import { Principal } from '../../identity/domain/principal';
import { AdjustmentDirection } from '../domain/cash.codes';
import { CashErrors } from '../domain/cash.errors';
import { BoxDetail, CashBoxReader, CashBook, CashWriteResult } from '../domain/ports/cash-boxes';
import { Pesos } from '../domain/pesos';
import { cleanNote, closingDifference, parseBusinessDate, parseReceived, positive, ReceivedPayment } from '../domain/settlement';

/** El rechazo de la base, con el código que la web traduce. */
function refusal(result: Extract<CashWriteResult, { ok: false }>, paymentMethod?: string) {
  switch (result.reason) {
    case 'CLOSED':
      return CashErrors.closed();
    case 'ALREADY_OPENED':
      return CashErrors.alreadyOpened();
    case 'NO_BASE_MODE':
      return CashErrors.noBaseForMode(null);
    case 'BUSY':
      return CashErrors.courierBusy();
    case 'NOTE':
      return CashErrors.noteRequired();
    case 'NO_ACCOUNT':
      return CashErrors.accountRequired(paymentMethod ?? '');
    default:
      return CashErrors.reversalInvalid();
  }
}

/**
 * H11.1 y H11.3: las cajas del día en el panel. El administrador con alcance solo ve y toca las de su municipio (404
 * si no); las reglas del libro (una base por caja, nada nuevo en una caja cerrada, nota en los ajustes y en un cierre
 * con diferencia) las hace cumplir la base, y aquí se traducen.
 */
@Injectable()
export class CashBoxesUseCase {
  constructor(
    private readonly reader: CashBoxReader,
    private readonly book: CashBook,
    private readonly scope: MunicipalityScope,
  ) {}

  async board(principal: Principal, input: { municipalityId?: number; date?: string }) {
    const municipality = await this.scope.resolve(principal, input.municipalityId);
    const today = await this.reader.today(municipality.id);
    const date = input.date === undefined ? today : parseBusinessDate(input.date);
    if (!date || date > today) throw CashErrors.dateInvalid();
    return { municipality, date, today, couriers: await this.reader.board(municipality.id, date), methods: await this.reader.methods() };
  }

  async detail(principal: Principal, boxId: string): Promise<BoxDetail> {
    const box = await this.reader.detail(boxId);
    if (!box || !this.sees(principal, box.municipalityId)) throw CashErrors.boxNotFound();
    return box;
  }

  /** La base de hoy para un domiciliario cuyo modo la exige. */
  async open(principal: Principal, input: { courierUserId: string; amount: string; paymentMethod: string; note?: string }) {
    const day = await this.reader.courierDay(input.courierUserId);
    if (!day || !this.sees(principal, day.municipalityId)) throw CashErrors.courierNotFound();
    if (!day.requiresOpening) throw CashErrors.noBaseForMode(day.fundingMode);
    const amount = positive(input.amount);
    if (!(await this.reader.methods()).some((m) => m.code === input.paymentMethod)) throw CashErrors.paymentMethodInvalid();
    const result = await this.book.open({
      courierUserId: day.courierUserId,
      businessDate: day.today,
      amount: amount.toString(),
      paymentMethod: input.paymentMethod,
      note: cleanNote(input.note),
      actorUserId: principal.userId,
    });
    if (!result.ok) throw refusal(result, input.paymentMethod);
    return { boxId: result.boxId };
  }

  /**
   * Un ajuste firmado. Para anular un movimiento basta con decir cuál: el sentido y el monto salen del original (el
   * contrario, el mismo), así nadie los teclea mal. Si no, el administrador da sentido y monto.
   */
  async adjust(principal: Principal, boxId: string, input: { note?: string; reversesMovementId?: string; direction?: AdjustmentDirection; amount?: string }) {
    const box = await this.detail(principal, boxId);
    const note = cleanNote(input.note);
    if (!note) throw CashErrors.noteRequired();
    let direction: 1 | -1;
    let amount: Pesos;
    if (input.reversesMovementId) {
      const original = await this.reader.movementBox(input.reversesMovementId);
      if (!original || original.courierUserId !== box.courierUserId) throw CashErrors.movementNotFound();
      direction = original.direction === 1 ? -1 : 1;
      amount = Pesos.of(original.amount);
    } else {
      if (!input.direction || input.amount === undefined) throw CashErrors.amountInvalid();
      direction = input.direction === 'IN' ? 1 : -1;
      amount = positive(input.amount);
    }
    const result = await this.book.adjust({
      boxId: box.id,
      direction,
      amount: amount.toString(),
      note,
      reversesMovementId: input.reversesMovementId ?? null,
      actorUserId: principal.userId,
    });
    if (!result.ok) throw refusal(result);
    return { movementId: result.movementId };
  }

  /** El cierre: lo que entregó por cada medio y, si no cuadra, la nota obligatoria. Devuelve la diferencia que quedó. */
  async close(principal: Principal, boxId: string, input: { received: ReceivedPayment[]; notes?: string }) {
    const box = await this.detail(principal, boxId);
    if (box.state === 'CLOSED') throw CashErrors.closed();
    const received = parseReceived(input.received, await this.reader.methods());
    const difference = closingDifference(box.amountDue, received);
    const notes = cleanNote(input.notes);
    if (!difference.isZero() && !notes) throw CashErrors.noteRequired();
    const result = await this.book.close({
      boxId: box.id,
      received: received.map((r) => ({ paymentMethod: r.paymentMethod, amount: r.amount.toString() })),
      notes,
      actorUserId: principal.userId,
    });
    if (!result.ok) throw refusal(result);
    return { boxId: box.id, difference: difference.toString() };
  }

  private sees(principal: Principal, municipalityId: number | null) {
    return principal.municipalityId === null || principal.municipalityId === municipalityId;
  }
}
