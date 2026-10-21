/** Un teléfono con el reloj adelantado unos segundos no es un error; más que esto, sí. */
const MAX_FUTURE_SKEW_MS = 2 * 60_000;
/** Más viejo que esto no es una zona sin señal: es una cola olvidada o un reloj mal puesto. */
const MAX_OFFLINE_AGE_MS = 12 * 60 * 60_000;

/**
 * Cómo llega un cambio hecho por el domiciliario. `clientEventId` lo genera la app: reenviarlo no lo repite.
 * `queued` dice si salió de la cola sin señal (H08.8); entonces `occurredAt` es la hora del teléfono.
 */
export interface TripEvent {
  clientEventId: string;
  occurredAt?: Date;
  queued: boolean;
}

/**
 * H08.8: la API acepta la hora original de un cambio sin señal si es coherente: no antes del último cambio del
 * pedido (`floor`), no del futuro y no de hace más de 12 horas. Si no lo es, vale la hora en que llegó.
 * Un cambio en línea siempre toma la hora del servidor.
 */
export function resolveOccurredAt(event: TripEvent, floor: Date, now: Date): { at: Date; offline: boolean } {
  if (!event.queued || !event.occurredAt) return { at: now, offline: false };
  const claimed = event.occurredAt.getTime();
  const coherent =
    claimed >= floor.getTime() && claimed <= now.getTime() + MAX_FUTURE_SKEW_MS && now.getTime() - claimed <= MAX_OFFLINE_AGE_MS;
  return { at: coherent ? new Date(Math.min(claimed, now.getTime())) : now, offline: true };
}
