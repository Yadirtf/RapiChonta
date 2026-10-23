import { Injectable } from '@nestjs/common';
import { FileUrls } from '../../../files/application/file-urls';
import { DeskEvent, DeskOrder, DeskOrderDetail, Person } from '../../domain/ports/desk';

const person = (p: Person) => ({ givenNames: p.givenNames, familyNames: p.familyNames });
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Forma pública del panel de pedidos: montos en texto decimal (RNF-05), fechas ISO y códigos que la web traduce. */
@Injectable()
export class DeskPresenter {
  constructor(private readonly urls: FileUrls) {}

  order(o: DeskOrder) {
    return {
      code: o.code,
      status: o.status,
      statusSince: o.statusSince.toISOString(),
      createdAt: o.createdAt.toISOString(),
      establishment: o.establishment,
      zoneName: o.zoneName,
      customer: { ...person(o.customer), phone: o.customer.phone },
      courier: o.courier ? { userId: o.courier.userId, ...person(o.courier), phone: o.courier.phone, holding: o.courier.holding } : null,
      total: o.total,
      paymentMethod: o.paymentMethod,
      alerts: o.alerts.map((a) => ({ code: a.code, since: a.since.toISOString() })),
      incident: o.incident
        ? {
            id: o.incident.id,
            type: o.incident.type,
            status: o.incident.status,
            description: o.incident.description,
            createdAt: o.incident.createdAt.toISOString(),
            reportedByRole: o.incident.reportedByRole,
            takenBy: o.incident.takenBy ? person(o.incident.takenBy) : null,
          }
        : null,
      cancellable: o.cancellable,
    };
  }

  detail(d: DeskOrderDetail) {
    return {
      ...this.order(d),
      lines: d.lines,
      amounts: d.amounts,
      delivery: { label: d.delivery.label, line: d.delivery.line, reference: d.delivery.reference, latitude: d.delivery.location.latitude, longitude: d.delivery.location.longitude },
      notes: d.notes,
      purchase: d.purchase ? { amount: d.purchase.amount, receiptUrl: this.urls.url(d.purchase.receiptFileId) } : null,
      proof: d.proof ? { url: this.urls.url(d.proof.fileId), capturedAt: iso(d.proof.capturedAt), distanceMeters: d.proof.distanceMeters } : null,
      collection: d.collection ? { total: d.collection.total, payments: d.collection.payments.map((p) => ({ paymentMethod: p.paymentMethod, amount: p.amount, at: p.at.toISOString() })) } : null,
      cancellation: d.cancellation,
      timeline: d.timeline.map((e) => this.event(e)),
    };
  }

  private event(e: DeskEvent) {
    const at = e.at.toISOString();
    switch (e.kind) {
      case 'STATUS':
        return { kind: e.kind, at, from: e.from, to: e.to, actor: e.actor ? { ...person(e.actor), role: e.actor.role } : null, source: e.source, note: e.note };
      case 'OFFER':
        return {
          kind: e.kind,
          at,
          mode: e.mode,
          sentBy: e.sentBy ? person(e.sentBy) : null,
          recipients: e.recipients.map((r) => ({ ...person(r.name), status: r.status, respondedAt: iso(r.respondedAt) })),
        };
      case 'RELEASE':
        return { kind: e.kind, at, courier: person(e.courier), reason: e.reason, by: e.by ? person(e.by) : null };
      case 'ADJUSTMENT':
        return { kind: e.kind, at, expiresAt: e.expiresAt.toISOString(), lines: e.lines.map((l) => ({ ...l, decidedAt: iso(l.decidedAt) })) };
      case 'COLLECTION':
        return { kind: e.kind, at, paymentMethod: e.paymentMethod, amount: e.amount };
      case 'INCIDENT':
        return { kind: e.kind, at, incidentId: e.incidentId, status: e.status, type: e.type, by: { ...person(e.by), role: e.by.role }, resolution: e.resolution, note: e.note };
      default:
        return { kind: e.kind, at };
    }
  }
}
