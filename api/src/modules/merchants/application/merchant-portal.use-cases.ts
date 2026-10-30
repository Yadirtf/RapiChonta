import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { OrderCode } from '../../orders/domain/value-objects/order-code';
import { assertPreparationMinutes, laneOf, sortCounter, suggestedMinutes } from '../domain/merchant-orders';
import { CLOSED_WINDOW_HOURS, PREPARATION_MINUTES } from '../domain/merchants.codes';
import { MerchantErrors } from '../domain/merchants.errors';
import { MerchantDesk, MerchantResult } from '../domain/ports/merchant-desk';

const MAX_NOTE = 300;

/**
 * H15.1: el portal del comercio aliado. Recibe sus pedidos directos, los acepta con su tiempo real de preparación (o
 * los rechaza con un motivo), avisa cuando están listos y abre o pausa el local. Todo con el alcance de los locales
 * que atiende: un pedido o local ajeno es 404.
 */
@Injectable()
export class MerchantPortalUseCase {
  constructor(
    private readonly desk: MerchantDesk,
    private readonly notifier: Notifier,
  ) {}

  stores(principal: Principal) {
    return this.desk.stores(principal.userId);
  }

  async options() {
    return { declineReasons: await this.desk.declineReasons(), preparationMinutes: PREPARATION_MINUTES, closedWindowHours: CLOSED_WINDOW_HOURS };
  }

  /** El mostrador: cada pedido con su columna y el tiempo sugerido para aceptarlo, lo más urgente primero. */
  async counter(principal: Principal, establishmentId: string) {
    const orders = await this.desk.counter(principal.userId, establishmentId, CLOSED_WINDOW_HOURS);
    if (!orders) throw MerchantErrors.storeNotFound();
    return sortCounter(orders).map((order) => ({ ...order, lane: laneOf(order), suggestedMinutes: suggestedMinutes(order.lines) }));
  }

  async accept(principal: Principal, rawCode: string, minutes: number) {
    const preparationMinutes = assertPreparationMinutes(minutes);
    return this.apply(await this.desk.accept(this.actor(principal), this.code(rawCode), preparationMinutes), rawCode);
  }

  async decline(principal: Principal, rawCode: string, input: { reason: string; notes?: string }) {
    const notes = input.notes?.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE) || null;
    return this.apply(await this.desk.decline(this.actor(principal), this.code(rawCode), input.reason, notes), rawCode);
  }

  async markReady(principal: Principal, rawCode: string) {
    return this.apply(await this.desk.markReady(this.actor(principal), this.code(rawCode)), rawCode);
  }

  async setOpen(principal: Principal, establishmentId: string, open: boolean) {
    const result = await this.desk.setOpen(this.actor(principal), establishmentId, open);
    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') throw MerchantErrors.storeNotFound();
      if (result.reason === 'MENU') throw MerchantErrors.menuEmpty();
      throw MerchantErrors.storeStatusNotAllowed(result.status ?? 'UNKNOWN');
    }
    return { establishmentId, status: result.status };
  }

  private code(rawCode: string): string {
    const code = OrderCode.normalize(rawCode);
    if (!code) throw MerchantErrors.orderNotFound();
    return code;
  }

  private actor(principal: Principal) {
    return { userId: principal.userId, role: principal.role };
  }

  private apply(result: MerchantResult, rawCode: string) {
    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') throw MerchantErrors.orderNotFound();
      if (result.reason === 'REASON') throw MerchantErrors.declineReasonInvalid();
      throw MerchantErrors.orderStepNotAllowed(result.status ?? 'UNKNOWN');
    }
    // El aviso al cliente (aceptado o cancelado) o al domiciliario (listo) ya está en la bandeja de salida.
    this.notifier.kick();
    return { orderCode: this.code(rawCode), status: result.status };
  }
}
