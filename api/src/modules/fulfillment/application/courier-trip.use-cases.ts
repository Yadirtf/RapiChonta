import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { rankSubstitutes, ReportedLine, reportProblem } from '../domain/adjustments';
import { resolveOccurredAt, TripEvent } from '../domain/event-time';
import { TRIP_STATUSES, TripStatusCode } from '../domain/fulfillment.codes';
import { FulfillmentErrors } from '../domain/fulfillment.errors';
import { AdjustmentReader, OrderAdjustments } from '../domain/ports/adjustments';
import { CourierCollections, CourierTrips, CustomerDeliveries, GeofenceProbe, Trip, TripCommand, TripResult } from '../domain/ports/courier-trips';
import { MAX_INCIDENT_DESCRIPTION } from '../domain/incidents';
import { CollectedPayment, resolveCollection } from '../domain/collection';
import { PreparationSignal } from './preparation-signal';

/** Pesos con hasta dos decimales; tope de 10 dígitos enteros (numeric(12,2)). */
const AMOUNT = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

/** El rechazo de la base, con el código que la app traduce. */
function refusal(result: Extract<TripResult, { ok: false }>) {
  switch (result.reason) {
    case 'RECEIPT':
      return FulfillmentErrors.receiptInvalid();
    case 'CODE':
      return FulfillmentErrors.deliveryCodeWrong(result.attemptsLeft ?? 0);
    case 'CODE_LOCKED':
      return FulfillmentErrors.deliveryCodeLocked();
    case 'PROOF_EARLY':
      return FulfillmentErrors.proofTooEarly(result.availableAt ?? new Date());
    case 'PROOF':
      return FulfillmentErrors.proofInvalid();
    case 'LINES':
      return FulfillmentErrors.adjustmentLinesInvalid();
    default:
      return FulfillmentErrors.stepNotAllowed(result.status);
  }
}

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
    private readonly adjustments: OrderAdjustments,
    private readonly reader: AdjustmentReader,
  ) {}

  /** En el local, con la última consulta al cliente: el domiciliario ve la cuenta regresiva y después la decisión. */
  async active(principal: Principal, language: string): Promise<Trip | null> {
    const trip = await this.trips.active(principal.userId, language);
    if (!trip || (trip.status !== TRIP_STATUSES.AT_ESTABLISHMENT && trip.status !== TRIP_STATUSES.AWAITING_CUSTOMER)) return trip;
    const [latest] = await this.reader.forOrder(trip.orderId, language);
    return { ...trip, adjustment: latest ?? null };
  }

  /**
   * H09.2 "Falta algo / cambió el precio": una sola consulta con todas las líneas con problema. Necesita señal (el
   * cliente decide en ese momento), así que no sale de la cola sin señal: la hora es siempre la del servidor.
   */
  async reportAdjustment(principal: Principal, code: string, event: TripEvent & { lines: ReportedLine[] }, now = new Date()) {
    return this.step(principal, code, { ...event, queued: false }, [TRIP_STATUSES.AT_ESTABLISHMENT], TRIP_STATUSES.AWAITING_CUSTOMER, now, async (command) => {
      const problem = reportProblem(event.lines, await this.adjustments.linePrices(command.trip.orderId));
      if (problem) throw FulfillmentErrors.adjustmentReportInvalid(problem);
      return this.trips.openAdjustment({ ...command, lines: event.lines });
    });
  }

  /** H08.4: total pagado + foto de la factura → PREPARING (empieza la cuenta de preparación). */
  async purchase(principal: Principal, code: string, event: TripEvent & { amount: string; receiptFileId: string }, now = new Date()) {
    if (!AMOUNT.test(event.amount) || Number(event.amount) <= 0) throw FulfillmentErrors.purchaseAmountInvalid();
    return this.step(principal, code, event, [TRIP_STATUSES.AT_ESTABLISHMENT], TRIP_STATUSES.PREPARING, now, (command) =>
      this.trips.registerPurchase({ ...command, amount: event.amount, receiptFileId: event.receiptFileId }),
    );
  }

  /** E15 "Recogí el pedido" (pedido directo): le paga al comercio lo que vale y sale → ON_THE_WAY, igual que "Ya está listo". */
  pickUp(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.AT_ESTABLISHMENT], TRIP_STATUSES.ON_THE_WAY, now, (command) => this.trips.pickUp(command));
  }

  /** H08.5 "Ya está listo" → ON_THE_WAY (el cliente recibe "Tu pedido va en camino" y ve su código de entrega). */
  ready(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.PREPARING], TRIP_STATUSES.ON_THE_WAY, now, (command) => this.trips.markReady(command));
  }

  /** H08.5 "Sigue en preparación": el cliente ve el aviso de alta demanda y el recordatorio se repite. */
  delay(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.PREPARING], TRIP_STATUSES.PREPARING, now, (command) => this.trips.reportDelay(command));
  }

  /** "Llegué": lo mismo que la geocerca cuando el GPS no la dispara. El cliente recibe "Tu domiciliario está llegando". */
  arrived(principal: Principal, code: string, event: TripEvent, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.ON_THE_WAY], TRIP_STATUSES.ARRIVING, now, (command) => this.trips.markArrived(command));
  }

  /** El código que le dice el cliente → DELIVERED; el domiciliario queda libre. */
  deliver(principal: Principal, code: string, event: TripEvent & { deliveryCode: string }, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.ON_THE_WAY, TRIP_STATUSES.ARRIVING], TRIP_STATUSES.DELIVERED, now, (command) =>
      this.trips.deliverWithCode({ ...command, deliveryCode: event.deliveryCode }),
    );
  }

  /** Sin código: la foto de la entrega → PENDING_REVIEW; el domiciliario queda libre y el cliente puede reclamar. */
  proof(principal: Principal, code: string, event: TripEvent & { fileId: string }, now = new Date()) {
    return this.step(principal, code, event, [TRIP_STATUSES.ARRIVING], TRIP_STATUSES.PENDING_REVIEW, now, (command) =>
      this.trips.deliverWithProof({ ...command, fileId: event.fileId }),
    );
  }

  private async step(
    principal: Principal,
    code: string,
    event: TripEvent,
    expected: readonly TripStatusCode[],
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
    if (!(expected as readonly string[]).includes(trip.status)) throw FulfillmentErrors.stepNotAllowed(trip.status);

    const { at, offline } = resolveOccurredAt(event, trip.lastChangeAt, now);
    const result = await work({ courierUserId: principal.userId, trip, clientEventId: event.clientEventId, occurredAt: at, offline });
    if (!result.ok) throw refusal(result);
    // El cambio de estado ya encoló el aviso al cliente (E06); el reloj (preparación, revisión de la foto) cambió su próxima hora.
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

/** El cliente cierra su pedido: "Recibí mi pedido" en cualquier momento desde que sale del local, o "No lo recibí" tras la foto. */
@Injectable()
export class CustomerDeliveryUseCase {
  constructor(
    private readonly deliveries: CustomerDeliveries,
    private readonly notifier: Notifier,
    private readonly clock: PreparationSignal,
  ) {}

  confirmReceived(principal: Principal, code: string) {
    return this.apply(code, () => this.deliveries.confirmReceived(principal.userId, code));
  }

  /** H10.3: lo que cuente el cliente ("nadie me tocó", "lo dejaron en otra casa") va con la novedad, recortado. */
  reportNotReceived(principal: Principal, code: string, description?: string | null) {
    const text = description?.trim().slice(0, MAX_INCIDENT_DESCRIPTION) || null;
    return this.apply(code, () => this.deliveries.reportNotReceived(principal.userId, code, text));
  }

  private async apply(code: string, change: () => ReturnType<CustomerDeliveries['confirmReceived']>) {
    const result = await change();
    if (!result.ok) throw result.reason === 'NOT_FOUND' ? FulfillmentErrors.orderNotFound() : FulfillmentErrors.deliveryStepNotAllowed(result.status ?? 'UNKNOWN');
    if (result.changed) {
      this.notifier.kick();
      this.clock.reschedule();
    }
    return { orderCode: code, status: result.status };
  }
}

/**
 * H09.3: el cliente decide sobre lo que falta o cambió de precio, con opciones cerradas y el tiempo corriendo. Con
 * la última decisión el pedido vuelve a la compra (o se cancela) y el domiciliario recibe el aviso.
 */
@Injectable()
export class CustomerAdjustmentsUseCase {
  constructor(
    private readonly adjustments: OrderAdjustments,
    private readonly notifier: Notifier,
    private readonly clock: PreparationSignal,
  ) {}

  async decide(principal: Principal, code: string, adjustmentId: string, input: { decision: string; productVersionId?: string }) {
    const result = await this.adjustments.decide({ customerUserId: principal.userId, orderCode: code, adjustmentId, ...input });
    if (!result.ok) {
      switch (result.reason) {
        case 'NOT_FOUND':
          throw FulfillmentErrors.orderNotFound();
        case 'OPTION':
          throw FulfillmentErrors.adjustmentOptionInvalid();
        case 'SUBSTITUTE':
          throw FulfillmentErrors.substituteUnavailable();
        default:
          throw FulfillmentErrors.adjustmentClosed(result.status ?? 'UNKNOWN');
      }
    }
    if (result.resolved) {
      this.notifier.kick();
      this.clock.reschedule();
    }
    return { orderCode: code, status: result.status, resolved: result.resolved };
  }

  /** "Cambiar por": primero lo de la misma sección del menú y precio parecido (rankSubstitutes). */
  async substitutes(principal: Principal, code: string, adjustmentId: string, language: string) {
    const found = await this.adjustments.substitutes(principal.userId, code, adjustmentId, language);
    if (!found) throw FulfillmentErrors.adjustmentClosed('UNKNOWN');
    return rankSubstitutes(found.original, found.candidates, found.inOrder);
  }
}

/**
 * H10.2: el cobro contra entrega. El domiciliario marca con qué medio(s) le pagó el cliente y cuánto; la cuenta que
 * recibió el dinero sale de sus cuentas (nunca la manda la app). Se puede encolar sin señal: la hora del teléfono solo
 * elige la caja del día y no cambia el pedido. Un cobro por pedido: reenviarlo no lo duplica.
 */
@Injectable()
export class CourierCollectionsUseCase {
  constructor(private readonly collections: CourierCollections) {}

  async record(principal: Principal, code: string, payments: CollectedPayment[], event: TripEvent, now = new Date()) {
    const resolved = resolveCollection(payments, await this.collections.methods(principal.userId));
    if (!resolved.ok) throw FulfillmentErrors.collectionInvalid(resolved.problem);
    // Sin cambio de estado no hay hora anterior que respetar: la del teléfono vale si no es del futuro ni muy vieja.
    const { at } = resolveOccurredAt(event, new Date(0), now);
    const result = await this.collections.record(principal.userId, code, resolved.payments, at);
    if (!result.ok) throw result.reason === 'NOT_FOUND' ? FulfillmentErrors.collectionOrderNotFound() : FulfillmentErrors.collectionStepNotAllowed(result.status ?? 'UNKNOWN');
    return { orderCode: code, replayed: result.replayed };
  }

  accounts(principal: Principal) {
    return this.collections.accounts(principal.userId);
  }

  async setQr(principal: Principal, accountId: string, fileId: string) {
    if (!(await this.collections.setQr(principal.userId, accountId, fileId))) throw FulfillmentErrors.collectionAccountNotFound();
    return (await this.collections.accounts(principal.userId)).find((a) => a.id === accountId)!;
  }

  pending(principal: Principal) {
    return this.collections.pending(principal.userId);
  }
}
