import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { GeofenceUseCase } from '../../fulfillment/application/courier-trip.use-cases';
import { AVAILABILITY_END_REASONS, COURIER_FRESH_SECONDS } from '../domain/dispatch.codes';
import { DispatchErrors } from '../domain/dispatch.errors';
import { plausibleReadings } from '../domain/location-plausibility';
import { responseError } from '../domain/offer-plan';
import { CourierDesk, LocationReading } from '../domain/ports/courier-desk';

/** Lecturas más de 2 minutos en el futuro se descartan (reloj mal puesto sin `sentAt`, o GPS simulado). */
const MAX_CLOCK_SKEW_MS = 120_000;

export interface ReportedReading {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  recordedAt: Date;
  /** Android marca la lectura como de una app de ubicación simulada. */
  mocked?: boolean;
}

/** H08.1: Disponible y ubicación. */
@Injectable()
export class CourierAvailabilityUseCase {
  constructor(
    private readonly desk: CourierDesk,
    private readonly geofence: GeofenceUseCase,
  ) {}

  async status(principal: Principal, now = new Date()) {
    const status = await this.desk.status(principal.userId);
    if (!status) throw DispatchErrors.notVerified();
    // Lo mismo que mira el panel para listarlo como ofrecible (COURIER_FRESH_SECONDS).
    const locationFresh = status.lastLocationAt !== null && now.getTime() - status.lastLocationAt.getTime() < COURIER_FRESH_SECONDS * 1000;
    return { ...status, locationFresh };
  }

  async setAvailable(principal: Principal, available: boolean) {
    if (!available) {
      await this.desk.closeAvailability(principal.userId, AVAILABILITY_END_REASONS.TOGGLED_OFF);
      return this.status(principal);
    }
    const status = await this.status(principal);
    if (!status.verified) throw DispatchErrors.notVerified();
    if (status.locationConsentPending) throw DispatchErrors.locationConsentRequired();
    await this.desk.openAvailability(principal.userId);
    return this.status(principal);
  }

  /**
   * Guarda solo con Disponible activo o un pedido en curso (RNF-06). Descarta lecturas simuladas, del futuro y
   * con saltos imposibles (H08.3), y después revisa en el servidor si llegó al local o donde el cliente.
   *
   * `sentAt` es la hora del teléfono al enviar el lote: la diferencia con la del servidor corrige la de cada
   * lectura. Así un reloj mal puesto (hora manual, zona horaria equivocada) no deja las lecturas "viejas" para el
   * panel ni "del futuro" para la API, y las lecturas en cola conservan cuánto tiempo pasó entre ellas.
   */
  async reportLocations(principal: Principal, readings: ReportedReading[], now = new Date(), sentAt?: Date) {
    if (!(await this.desk.expectsLocation(principal.userId))) throw DispatchErrors.locationNotExpected();
    const skewMs = sentAt ? now.getTime() - sentAt.getTime() : 0;
    const candidates: LocationReading[] = readings
      .map((r) => ({ ...r, recordedAt: new Date(r.recordedAt.getTime() + skewMs) }))
      .filter((r) => !r.mocked && r.recordedAt.getTime() <= now.getTime() + MAX_CLOCK_SKEW_MS)
      .map((r) => ({ location: GeoPoint.create(r.latitude, r.longitude), accuracyM: r.accuracyM ?? null, recordedAt: r.recordedAt }));
    const accepted = candidates.length ? plausibleReadings(await this.desk.lastReading(principal.userId), candidates) : [];
    if (accepted.length) await this.desk.recordLocations(principal.userId, accepted);
    const arrival = accepted.length ? await this.geofence.evaluate(principal.userId) : null;
    return { accepted: accepted.length, arrival };
  }
}

/** H08.2: ver las ofertas y responder "Tomar pedido" o "No puedo". */
@Injectable()
export class CourierOffersUseCase {
  constructor(
    private readonly desk: CourierDesk,
    private readonly notifier: Notifier,
  ) {}

  pending(principal: Principal, language: string) {
    return this.desk.pendingOffers(principal.userId, language);
  }

  /** El primero que acepta gana; al otro le llega ORDER_ALREADY_TAKEN ("Ya fue tomado"). */
  async accept(principal: Principal, offerId: string) {
    const result = await this.desk.accept(offerId, principal.userId);
    if (!result.ok) throw responseError(result.reason);
    // El cliente ("Tu pedido ya tiene domiciliario") y los demás destinatarios (oferta retirada) ya están en la bandeja.
    this.notifier.kick();
    return { orderCode: result.orderCode };
  }

  async reject(principal: Principal, offerId: string) {
    const result = await this.desk.reject(offerId, principal.userId);
    if (!result.ok) throw responseError(result.reason);
    return { orderCode: result.orderCode };
  }
}
