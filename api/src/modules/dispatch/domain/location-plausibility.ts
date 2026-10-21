import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';

export interface TimedPoint {
  location: GeoPoint;
  recordedAt: Date;
}

/**
 * Más rápido que esto no va una moto en el piloto (≈ 180 km/h): un salto así es un GPS simulado o una lectura
 * corrupta. Con margen para el error normal del GPS en lecturas muy seguidas.
 */
export const MAX_SPEED_MPS = 50;
/** El GPS de un teléfono salta unos metros aunque no se mueva: hasta aquí nunca se considera un salto. */
const JITTER_METERS = 150;

/**
 * H08.3: descarta las lecturas con saltos imposibles. Se recorren en orden de hora y cada una se compara con la
 * última aceptada (o con la última guardada), así un solo punto falso no arrastra a los que siguen.
 * Las lecturas con la misma hora que la anterior se descartan (duplicados de la cola sin señal).
 */
export function plausibleReadings<T extends TimedPoint>(previous: TimedPoint | null, readings: T[], maxSpeedMps = MAX_SPEED_MPS): T[] {
  const ordered = [...readings].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const accepted: T[] = [];
  let last = previous;
  for (const reading of ordered) {
    if (last) {
      const seconds = (reading.recordedAt.getTime() - last.recordedAt.getTime()) / 1000;
      if (seconds === 0) continue;
      const meters = reading.location.distanceTo(last.location);
      // Una lectura más vieja que la última guardada (llegó tarde) se mide igual, en valor absoluto.
      if (meters > JITTER_METERS && meters / Math.abs(seconds) > maxSpeedMps) continue;
    }
    accepted.push(reading);
    // Solo avanza la referencia hacia adelante en el tiempo.
    if (!last || reading.recordedAt > last.recordedAt) last = reading;
  }
  return accepted;
}
