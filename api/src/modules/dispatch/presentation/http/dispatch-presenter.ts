import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { CourierOffer, CourierStatus } from '../../domain/ports/courier-desk';
import { AvailableCourier, BoardOrder, PersonName } from '../../domain/ports/dispatch-board';
import { StaffActivityEntry } from '../../domain/ports/staff-activity';

const geo = (p: GeoPoint) => ({ latitude: p.latitude, longitude: p.longitude });
const person = (n: PersonName) => ({ givenNames: n.givenNames, familyNames: n.familyNames });

/** Forma pública del despacho: montos en texto decimal (RNF-05), fechas ISO y códigos que la web traduce. */
export const DispatchPresenter = {
  /** `receiptUrl` firma la URL de la factura (FileUrls): se calcula en cada respuesta, nunca se guarda. */
  order: (o: BoardOrder, receiptUrl: (fileId: string) => string | null) => ({
    code: o.code,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    statusSince: o.statusSince.toISOString(),
    needsCourier: o.needsCourier,
    waitingSince: o.waitingSince?.toISOString() ?? null,
    returnedBy: o.returnedBy,
    establishment: { id: o.establishment.id, name: o.establishment.name, addressLine: o.establishment.addressLine, ...geo(o.establishment.location) },
    delivery: { ...geo(o.delivery.location), reference: o.delivery.reference, zoneName: o.delivery.zoneName, zoneKind: o.delivery.zoneKind },
    itemCount: o.itemCount,
    itemsTotal: o.amounts.items,
    deliveryFee: o.amounts.deliveryFee,
    total: o.amounts.total,
    paymentMethod: o.paymentMethod,
    offers: o.liveOffers.map((offer) => ({
      id: offer.id,
      mode: offer.mode,
      sentAt: offer.sentAt.toISOString(),
      expiresAt: offer.expiresAt.toISOString(),
      sentBy: offer.sentBy ? person(offer.sentBy) : null,
      recipients: offer.recipients.map((r) => ({ courierUserId: r.courierUserId, ...person(r.name), status: r.status, respondedAt: r.respondedAt?.toISOString() ?? null })),
    })),
    courier: o.courier ? { userId: o.courier.userId, ...person(o.courier.name), assignedAt: o.courier.assignedAt.toISOString() } : null,
    purchase: o.purchase ? { amount: o.purchase.amount, receiptUrl: receiptUrl(o.purchase.receiptFileId) } : null,
    preparation: o.preparation ? { estimatedReadyAt: o.preparation.estimatedReadyAt.toISOString(), delayed: o.preparation.delayed } : null,
  }),

  courier: (c: AvailableCourier) => ({
    userId: c.userId,
    ...person(c.name),
    phone: c.phoneE164,
    vehicle: c.vehicle,
    ...geo(c.location),
    accuracyM: c.accuracyM,
    lastSeenAt: c.lastSeenAt.toISOString(),
    availableSince: c.availableSince.toISOString(),
    distanceMeters: c.distanceMeters,
    hasPendingOffer: c.hasPendingOffer,
    declined: c.declined,
  }),

  courierStatus: (s: CourierStatus) => ({
    verified: s.verified,
    locationConsentPending: s.locationConsentPending,
    available: s.availableSince !== null,
    availableSince: s.availableSince?.toISOString() ?? null,
    activeOrder: s.activeOrder,
  }),

  courierOffer: (o: CourierOffer) => ({
    offerId: o.offerId,
    orderCode: o.orderCode,
    expiresAt: o.expiresAt.toISOString(),
    establishment: { name: o.establishment.name, addressLine: o.establishment.addressLine, ...geo(o.establishment.location) },
    zone: o.zone,
    itemCount: o.itemCount,
    lines: o.lines,
    itemsTotal: o.itemsTotal,
    deliveryFee: o.deliveryFee,
    paymentMethod: o.paymentMethod,
    distanceMeters: o.distanceMeters,
  }),

  activity: (e: StaffActivityEntry) => ({
    id: e.id,
    occurredAt: e.occurredAt.toISOString(),
    actor: e.actor,
    action: e.action,
    entityTable: e.entityTable,
    entityId: e.entityId,
    orderCode: e.orderCode,
    details: e.details,
  }),
};
