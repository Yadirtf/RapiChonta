import { DispatchErrors } from './dispatch.errors';
import { OFFER_MODES, OfferModeCode } from './dispatch.codes';

/** Un domiciliario que el panel puede elegir, visto desde un pedido concreto. */
export interface OfferCandidate {
  userId: string;
  /** Ya tiene en pantalla una oferta viva de este pedido. */
  hasPendingOffer: boolean;
  /** Ya dijo "No puedo" a este pedido. */
  declined: boolean;
  /** Su ubicación llegó hace poco. Sin ella no se le ofrece: no se sabe dónde está ni si la app sigue viva. */
  locationFresh: boolean;
  /** Su caja de hoy está lista (E11, H11.1): con base si su modo la exige, y sin cerrar. */
  cashReady: boolean;
}

/**
 * A quién va un envío (H07.3). Los candidatos son los domiciliarios en turno y libres; solo se ofrece a los
 * vistos hace poco (Docs/14 E07, "Domiciliarios cercanos").
 * - SPECIFIC: el elegido, aunque antes haya dicho que no (el operador pudo llamarlo); nunca dos veces a la vez.
 * - BROADCAST: todos los vistos hace poco que no lo tienen ya en pantalla ni lo rechazaron.
 * En los dos, nunca a quien no tiene la caja de hoy lista (E11): sin base no puede comprar.
 */
export function planRecipients(mode: OfferModeCode, candidates: OfferCandidate[], courierUserId?: string): string[] {
  if (mode === OFFER_MODES.SPECIFIC) {
    if (!courierUserId) throw DispatchErrors.courierRequired();
    const chosen = candidates.find((c) => c.userId === courierUserId);
    if (!chosen) throw DispatchErrors.courierNotAvailable();
    if (!chosen.locationFresh) throw DispatchErrors.courierLocationStale();
    if (!chosen.cashReady) throw DispatchErrors.cashBoxNotReady();
    if (chosen.hasPendingOffer) throw DispatchErrors.offerAlreadyPending();
    return [chosen.userId];
  }
  const recipients = candidates.filter((c) => c.locationFresh && c.cashReady && !c.hasPendingOffer && !c.declined).map((c) => c.userId);
  if (!recipients.length) throw DispatchErrors.noCouriersAvailable();
  return recipients;
}

/** Por qué no se pudo responder una oferta; el caso de uso lo traduce al error que ve el domiciliario. */
export type ResponseFailure = 'NOT_FOUND' | 'TAKEN' | 'EXPIRED' | 'CLOSED' | 'BUSY';

export function responseError(reason: ResponseFailure) {
  switch (reason) {
    case 'NOT_FOUND':
      return DispatchErrors.offerNotFound();
    case 'TAKEN':
      return DispatchErrors.alreadyTaken();
    case 'EXPIRED':
      return DispatchErrors.offerExpired();
    case 'BUSY':
      return DispatchErrors.courierBusy();
    default:
      return DispatchErrors.offerClosed();
  }
}

/**
 * Cuándo vuelve a mirar el reloj del despacho: justo después de la próxima oferta por vencer, o la revisión de
 * respaldo si no hay ninguna viva (larga, para que la base pueda dormir). Nunca antes de `minMs`.
 */
export function nextSweepDelay(nextExpiry: Date | null, now: Date, options: { idleMs: number; graceMs: number; minMs: number }): number {
  if (!nextExpiry) return options.idleMs;
  const due = nextExpiry.getTime() - now.getTime() + options.graceMs;
  return Math.min(options.idleMs, Math.max(options.minMs, due));
}
