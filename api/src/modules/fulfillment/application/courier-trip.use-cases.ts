import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { resolveOccurredAt, TripEvent } from '../domain/event-time';
import { TRIP_STATUSES, TripStatusCode } from '../domain/fulfillment.codes';
import { FulfillmentErrors } from '../domain/fulfillment.errors';
import { CourierTrips, GeofenceProbe, TripCommand, TripResult } from '../domain/ports/courier-trips';
import { PreparationSignal } from './preparation-signal';

/** Pesos con hasta dos decimales; tope de 10 dígitos enteros (numeric(12,2)). */
const AMOUNT = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export interface TripStepResult {
  orderCode: string;
  /** Estado después del paso; nulo si el pedido ya no está en curso (p. ej. un reenvío tardío). */
  status: string | null;
  /** El evento ya se había aplicado (reenvío desde la cola sin señal): no se hizo nada. */
  replayed: boolean;
}

/**
 * El pedido en curso del domiciliario (H08.4, H08.5, H08.8). Cada paso viene con un id de evento generado en la
 * app: si se reenvía (doble toque, cola sin señal) se responde como ya hecho, sin repetirlo.
 */
@Injectable()
export class CourierTripUseCase {
  constructor(
    private readonly trips: CourierTrips,
    private readonly notifier: Notifier,
    private readonly preparation: PreparationSignal,
  ) {}

  active(principal: Principal, language: string) {
    return this.trips.active(principal.userId, language);
  }

  /** H08.4: total pagado + foto de la factura → PREPARING (empieza la cuenta de preparación). */
  async purchase(principal: Principal, code: string, event: TripEvent & { amount: string; receiptFileId: string }, now = new Date()) {
    if (!AMOUNT.test(event.amount) || Number(event.amount) <= 0) throw FulfillmentErrors.purchaseAmountInvalid();
    return this.step(principal, code, event, TRIP_STATUSES.AT_ESTABLISHMENT, TRIP_STATUSES.PREPARING, now, (command) =>
      this.trips.registerPurchase({ ...command, amount: event.amount, receiptFileId: event.receiptFileId }),
    );
  }

  /** H08.5 "Ya está listo" → ON_THE_WAY (el cliente recibe "Tu pedido va en camino"). */
  ready(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, TRIP_STATUSES.PREPARING, TRIP_STATUSES.ON_THE_WAY, now, (command) => this.trips.markReady(command));
  }

  /** H08.5 "Sigue en preparación": el cliente ve el aviso de alta demanda y el recordatorio se repite. */
  delay(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, TRIP_STATUSES.PREPARING, TRIP_STATUSES.PREPARING, now, (command) => this.trips.reportDelay(command));
  }

  private async step(
    principal: Principal,
    code: string,
    event: TripEvent,
    expected: TripStatusCode,
    next: TripStatusCode,
    now: Date,
    work: (command: TripCommand) => Promise<TripResult>,
  ): Promise<TripStepResult> {
    const replayed = await this.trips.replayedOrderCode(event.clientEventId);
    if (replayed) {
      if (replayed !== code) throw FulfillmentErrors.eventConflict();
      const trip = await this.trips.ref(principal.userId, code);
      return { orderCode: code, status: trip?.status ?? null, replayed: true };
    }
    const trip = await this.trips.ref(principal.userId, code);
    if (!trip) throw FulfillmentErrors.tripNotFound();
    if (trip.status !== expected) throw FulfillmentErrors.stepNotAllowed(trip.status);

    const { at, offline } = resolveOccurredAt(event, trip.lastChangeAt, now);
    const result = await work({ courierUserId: principal.userId, trip, clientEventId: event.clientEventId, occurredAt: at, offline });
    if (!result.ok) throw result.reason === 'RECEIPT' ? FulfillmentErrors.receiptInvalid() : FulfillmentErrors.stepNotAllowed(result.status);
    // El cambio de estado ya encoló el aviso al cliente (E06); la preparación cambió su próxima revisión.
    this.notifier.kick();
    this.preparation.reschedule();
    return { orderCode: code, status: next, replayed: false };
  }
}

/** H08.3 / H08.6: después de guardar lecturas, el servidor revisa si el domiciliario llegó. */
@Injectable()
export class GeofenceUseCase {
  constructor(
    private readonly probe: GeofenceProbe,
    private readonly notifier: Notifier,
  ) {}

  async evaluate(courierUserId: string): Promise<{ orderCode: string; status: string } | null> {
    const arrival = await this.probe.evaluate(courierUserId);
    // "Tu domiciliario llegó a…" / "está llegando" ya está en la bandeja de salida: que salga ya.
    if (arrival) this.notifier.kick();
    return arrival;
  }
}
