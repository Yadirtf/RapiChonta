import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { FileUrls } from '../../../files/application/file-urls';
import { Trip } from '../../domain/ports/courier-trips';

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
    };
  }
}
