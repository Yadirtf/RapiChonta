import { Injectable } from '@nestjs/common';
import { FileUrls } from '../../../files/application/file-urls';
import { Quote } from '../../application/checkout.use-cases';
import { SavedAddress, SavedRecipient } from '../../domain/ports/address-book';
import { OrderDetail, OrderSummary } from '../../domain/ports/orders.repository';
import { Money } from '../../domain/value-objects/money';

/** Forma pública de los pedidos: montos en texto decimal (RNF-05) y códigos que la web y la app traducen. */
@Injectable()
export class OrdersPresenter {
  constructor(private readonly urls: FileUrls) {}

  quote({ establishment, checkout, delivery }: Quote) {
    return {
      establishment: { id: establishment.id, name: establishment.name },
      lines: checkout.lines.map((l) => ({
        productId: l.productId,
        productVersionId: l.productVersionId,
        name: l.name,
        unitPrice: Money.toDecimal(l.unitPriceCents),
        quantity: l.quantity,
        subtotal: Money.toDecimal(l.unitPriceCents * l.quantity),
      })),
      itemsTotal: Money.toDecimal(checkout.itemsCents),
      deliveryFee: Money.toDecimal(checkout.feeCents),
      total: Money.toDecimal(checkout.totalCents),
      prepMinutes: checkout.prepMinutes,
      zone: { name: delivery.zone.name, kind: delivery.zone.kind },
      newCustomerLimit: checkout.limit
        ? { limit: Money.toDecimal(checkout.limit.limitCents), available: Money.toDecimal(checkout.limit.availableCents), exceeded: checkout.exceedsNewCustomerLimit }
        : null,
    };
  }

  summary(o: OrderSummary) {
    return {
      code: o.code,
      establishment: { id: o.establishment.id, name: o.establishment.name, logoUrl: this.urls.url(o.establishment.logoFileId) },
      createdAt: o.createdAt.toISOString(),
      status: o.status.code,
      statusAt: o.status.at.toISOString(),
      active: !o.status.terminal,
      itemCount: o.itemCount,
      total: o.total,
    };
  }

  detail(o: OrderDetail) {
    return {
      ...this.summary(o),
      lines: o.lines.map((l) => ({ ...l, subtotal: Money.toDecimal(Money.toCents(l.unitPrice) * l.quantity) })),
      itemsTotal: o.amounts.items,
      deliveryFee: o.amounts.deliveryFee,
      prepMinutes: o.prepMinutes,
      zone: o.zone,
      address: { label: o.address.label, line: o.address.line, reference: o.address.reference, latitude: o.address.location.latitude, longitude: o.address.location.longitude },
      recipient: o.recipient ? { fullName: o.recipient.fullName, phone: o.recipient.phoneE164 } : null,
      paymentMethod: o.paymentMethod,
      notes: o.customerNotes,
      timeline: o.timeline.map((t) => ({ status: t.code, at: t.at.toISOString() })),
      journey: o.journey,
    };
  }

  address(a: SavedAddress) {
    return { id: a.id, label: a.label, line: a.line, reference: a.reference, latitude: a.location.latitude, longitude: a.location.longitude, isDefault: a.isDefault };
  }

  recipient(r: SavedRecipient) {
    return { id: r.id, fullName: r.fullName, phone: r.phoneE164 };
  }
}
