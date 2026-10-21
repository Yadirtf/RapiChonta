import { Injectable } from '@nestjs/common';
import { MunicipalityScope } from '../../business-config/application/municipality-scope';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { OrderCode } from '../../orders/domain/value-objects/order-code';
import { COURIER_FRESH_SECONDS, OfferModeCode } from '../domain/dispatch.codes';
import { DispatchErrors } from '../domain/dispatch.errors';
import { planRecipients } from '../domain/offer-plan';
import { DispatchBoard, DispatchTarget, OrderNoLongerDispatchable, RecipientRejected } from '../domain/ports/dispatch-board';
import { DispatchSignal } from './dispatch-signal';

/**
 * H07.1 y H07.2: la central de despacho del municipio. El panel la consulta cada pocos segundos (el tiempo real
 * llega en la Fase 3), así que todo sale de una lectura barata: pedidos activos y domiciliarios despachables.
 */
@Injectable()
export class DispatchBoardUseCase {
  constructor(
    private readonly board: DispatchBoard,
    private readonly scope: MunicipalityScope,
  ) {}

  async orders(principal: Principal, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    return { municipality, orders: await this.board.activeOrders(municipality.id) };
  }

  /** Con `orderCode`, ordenados por distancia a su local y marcando quién ya lo tiene o lo rechazó. */
  async couriers(principal: Principal, query: { municipalityId?: number; orderCode?: string }) {
    const municipality = await this.scope.resolve(principal, query.municipalityId);
    const order = query.orderCode ? await findInScope(this.board, principal, query.orderCode) : null;
    if (order && order.municipalityId !== municipality.id) throw DispatchErrors.orderNotFound();
    return this.board.couriers(municipality.id, COURIER_FRESH_SECONDS, order?.id);
  }
}

/** H07.3: enviar el pedido a un domiciliario o a todos los disponibles. */
@Injectable()
export class SendOfferUseCase {
  constructor(
    private readonly board: DispatchBoard,
    private readonly notifier: Notifier,
    private readonly signal: DispatchSignal,
  ) {}

  async execute(principal: Principal, rawCode: string, input: { mode: OfferModeCode; courierUserId?: string }) {
    const order = await findInScope(this.board, principal, rawCode);
    if (!order.needsCourier) throw DispatchErrors.orderNotDispatchable();
    const candidates = await this.board.couriers(order.municipalityId, COURIER_FRESH_SECONDS, order.id);
    const courierUserIds = planRecipients(input.mode, candidates, input.courierUserId);
    try {
      const offer = await this.board.createOffer({ orderId: order.id, mode: input.mode, sentByUserId: principal.userId, actingRole: principal.role, courierUserIds });
      // Los avisos ORDER_OFFERED ya están en la bandeja de salida (misma transacción): que salgan ya.
      this.notifier.kick();
      this.signal.reschedule();
      return { ...offer, recipients: courierUserIds.length };
    } catch (error) {
      if (error instanceof OrderNoLongerDispatchable) throw DispatchErrors.orderNotDispatchable();
      if (error instanceof RecipientRejected) throw DispatchErrors.courierNotAvailable();
      throw error;
    }
  }
}

/** El personal con alcance solo ve pedidos de su municipio; uno ajeno responde 404 (no revela que existe). */
async function findInScope(board: DispatchBoard, principal: Principal, rawCode: string): Promise<DispatchTarget> {
  const code = OrderCode.normalize(rawCode);
  const order = code ? await board.findOrder(code) : null;
  if (!order || (principal.municipalityId !== null && order.municipalityId !== principal.municipalityId)) throw DispatchErrors.orderNotFound();
  return order;
}
