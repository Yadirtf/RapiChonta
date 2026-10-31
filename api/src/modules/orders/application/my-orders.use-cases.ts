import { Injectable } from '@nestjs/common';
import { contentLanguage } from '../../catalog/application/public/get-establishment.use-case';
import { Principal } from '../../identity/domain/principal';
import { OrderErrors } from '../domain/orders.errors';
import { OrderDetail, OrdersRepository, OrderSummary } from '../domain/ports/orders.repository';
import { OrderCode } from '../domain/value-objects/order-code';

const PAGE = { default: 20, max: 50 } as const;

/**
 * H04.4: Mis pedidos. Los activos van primero y completos (son pocos); el historial se pagina por fecha.
 * Cada cliente solo ve los suyos: el id sale de la sesión, nunca de la URL.
 */
@Injectable()
export class ListMyOrdersUseCase {
  constructor(private readonly orders: OrdersRepository) {}

  async execute(
    principal: Principal,
    query: { before?: Date; limit?: number } = {},
  ): Promise<{ active: OrderSummary[]; past: OrderSummary[]; nextBefore: string | null; journeys: Record<string, string[]> }> {
    const limit = Math.min(PAGE.max, Math.max(1, Math.trunc(query.limit ?? PAGE.default)));
    const [active, past, journeys] = await Promise.all([
      // El historial pide la segunda página sin repetir los activos.
      query.before ? Promise.resolve([]) : this.orders.listMine(principal.userId, { active: true, limit: PAGE.max }),
      this.orders.listMine(principal.userId, { active: false, before: query.before, limit: limit + 1 }),
      this.orders.journeys(),
    ]);
    const page = past.slice(0, limit);
    return { active, past: page, nextBefore: past.length > limit ? page[page.length - 1].createdAt.toISOString() : null, journeys };
  }
}

/** H04.4 / RF-50: detalle con productos, dirección, medio de pago y línea de tiempo (nunca la ubicación del domiciliario). */
@Injectable()
export class GetMyOrderUseCase {
  constructor(private readonly orders: OrdersRepository) {}

  async execute(principal: Principal, rawCode: string, language?: string): Promise<OrderDetail> {
    const code = OrderCode.normalize(rawCode);
    const order = code ? await this.orders.findMine(principal.userId, code, contentLanguage(language)) : null;
    if (!order) throw OrderErrors.orderNotFound();
    return order;
  }
}
