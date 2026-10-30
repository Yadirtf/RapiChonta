import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { FileUrls } from '../../../files/application/file-urls';
import { SubstituteCandidate } from '../../domain/adjustments';
import { AdjustmentRequestView } from '../../domain/ports/adjustments';
import { CollectionAccount, PendingCollection, Trip } from '../../domain/ports/courier-trips';

/** Una consulta de E09 tal como la ven la web y la app (la misma forma para el cliente y el domiciliario). */
export const adjustmentView = (r: AdjustmentRequestView) => ({
  id: r.id,
  reportedAt: r.reportedAt.toISOString(),
  expiresAt: r.expiresAt.toISOString(),
  open: r.open,
  lines: r.lines.map((l) => ({
    id: l.id,
    orderItemId: l.orderItemId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    reason: l.reason,
    reportedUnitPrice: l.reportedUnitPrice,
    decision: l.decision,
    decidedAt: l.decidedAt?.toISOString() ?? null,
    substitute: l.substitute,
    options: l.options,
  })),
});

const geo = (p: GeoPoint) => ({ latitude: p.latitude, longitude: p.longitude });

/** Forma pública del pedido en curso del domiciliario: montos en texto decimal (RNF-05) y códigos que la app traduce. */
@Injectable()
export class FulfillmentPresenter {
  constructor(private readonly urls: FileUrls) {}

  trip(t: Trip) {
    return {
      code: t.code,
      status: t.status,
      statusAt: t.lastChangeAt.toISOString(),
      acceptedAt: t.acceptedAt.toISOString(),
      fulfillmentMode: t.fulfillmentMode,
      merchant: t.merchant ? { estimatedReadyAt: t.merchant.estimatedReadyAt.toISOString(), readyAt: t.merchant.readyAt?.toISOString() ?? null } : null,
      establishment: {
        name: t.establishment.name,
        addressLine: t.establishment.addressLine,
        phone: t.establishment.phone,
        ...geo(t.establishment.location),
        area: t.establishment.area.map(geo),
      },
      zone: t.zone,
      lines: t.lines,
      itemsTotal: t.itemsTotal,
      deliveryFee: t.deliveryFee,
      customerTotal: t.customerTotal,
      paymentMethod: t.paymentMethod,
      notes: t.customerNotes,
      destination: t.destination
        ? {
            label: t.destination.label,
            line: t.destination.line,
            reference: t.destination.reference,
            ...geo(t.destination.location),
            recipientName: t.destination.recipientName,
            recipientPhone: t.destination.recipientPhone,
          }
        : null,
      preparation: t.preparation
        ? {
            startedAt: t.preparation.startedAt.toISOString(),
            estimatedReadyAt: t.preparation.estimatedReadyAt.toISOString(),
            delayCount: t.preparation.delayCount,
            nextCheckAt: t.preparation.nextCheckAt.toISOString(),
          }
        : null,
      purchase: t.purchase ? { amount: t.purchase.amount, receiptUrl: this.urls.url(t.purchase.receiptFileId) } : null,
      delivery: t.delivery
        ? {
            arrivedAt: t.delivery.arrivedAt?.toISOString() ?? null,
            proofAvailableAt: t.delivery.proofAvailableAt?.toISOString() ?? null,
            codeAttemptsLeft: t.delivery.codeAttemptsLeft,
          }
        : null,
      adjustment: t.adjustment ? adjustmentView(t.adjustment) : null,
      collection: t.collection,
    };
  }

  /** H10.2: la cuenta con su QR (URL firmada, se calcula en cada respuesta). */
  account(a: CollectionAccount) {
    return {
      id: a.id,
      paymentMethod: a.paymentMethod,
      bank: a.bank,
      accountType: a.accountType,
      accountNumber: a.accountNumber,
      holderName: a.holderName,
      qrUrl: this.urls.url(a.qrFileId),
    };
  }

  pendingCollection(p: PendingCollection) {
    return { code: p.code, status: p.status, storeName: p.storeName, customerTotal: p.customerTotal, paymentMethod: p.paymentMethod, closedAt: p.closedAt.toISOString() };
  }

  substitute(c: SubstituteCandidate & { sameSection: boolean }) {
    return {
      productId: c.productId,
      productVersionId: c.productVersionId,
      name: c.name,
      price: c.price,
      imageUrl: this.urls.url(c.imageFileId),
      sameSection: c.sameSection,
    };
  }
}
