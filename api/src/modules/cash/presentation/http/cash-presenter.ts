import { Injectable } from '@nestjs/common';
import { BoxDetail, CourierBoxRow, CourierDay } from '../../domain/ports/cash-boxes';
import { Pesos } from '../../domain/pesos';
import { amountDue } from '../../domain/settlement';

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Forma pública de las cajas: montos en texto decimal (RNF-05), fechas ISO y códigos que la web y la app traducen. */
@Injectable()
export class CashPresenter {
  row(r: CourierBoxRow) {
    return {
      courier: { userId: r.courierUserId, ...r.name, phone: r.phoneE164 },
      fundingMode: r.fundingMode,
      requiresOpening: r.requiresOpening,
      busy: r.busy,
      canReceiveOffers: r.canReceiveOffers,
      box: r.box && { ...r.box, closedAt: iso(r.box.closedAt) },
    };
  }

  /** El detalle con el desglose; `balance.amountDue` sale de las partes y coincide con el de la base. */
  detail(b: BoxDetail) {
    return {
      id: b.id,
      businessDate: b.businessDate,
      courier: { userId: b.courierUserId, ...b.name },
      fundingMode: b.fundingMode,
      state: b.state,
      closure: b.closure && { closedAt: b.closure.closedAt.toISOString(), closedBy: b.closure.closedBy, notes: b.closure.notes },
      totals: b.totals.map((t) => ({ ...t, signed: Pesos.of(t.total).times(t.direction).toString() })),
      balance: { ...amountDue(b.totals, b.courierFees, b.commissions), settledOrders: b.settledOrders },
      movements: b.movements.map((m) => ({
        ...m,
        signed: Pesos.of(m.amount).times(m.direction).toString(),
        createdAt: m.createdAt.toISOString(),
        // Se anula un movimiento que no es corrección y que nadie anuló aún.
        reversible: !m.isCorrection && m.reversedById === null,
      })),
      orders: b.orders,
      uncollected: b.uncollected.map((u) => ({ ...u, closedAt: u.closedAt.toISOString() })),
    };
  }

  day(d: CourierDay) {
    return { today: d.today, fundingMode: d.fundingMode, requiresOpening: d.requiresOpening, canReceiveOffers: d.canReceiveOffers };
  }
}
