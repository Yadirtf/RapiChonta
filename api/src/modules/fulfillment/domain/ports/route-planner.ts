import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';

/** Recorrido por las calles entre dos puntos: la línea a dibujar ([lng, lat], como GeoJSON), metros y segundos. */
export interface PlannedRoute {
  line: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Servicio de rutas con datos de OpenStreetMap (OpenRouteService u OSRM). La ruta solo es tan buena como las calles
 * que OSM tenga del pueblo. Nulo si el servicio no responde: la app sigue con "Cómo llegar".
 */
export abstract class RoutePlanner {
  abstract plan(from: GeoPoint, to: GeoPoint): Promise<PlannedRoute | null>;
}
