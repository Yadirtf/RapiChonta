import { distanceMeters, type Establishment, type GeoPoint } from "../../domain/entities/establishment";
import type { EstablishmentRepository } from "../../domain/repositories/establishment-repository";

/** Radio del mapa de inicio: Villagarzón cabe entero en 3 km desde casi cualquier punto del casco urbano. */
const HOME_RADIUS_METERS = 3000;
/** Máximo que acepta la API (y el mismo alcance con el que el mapa se queda en la ubicación del cliente). */
const MAX_RADIUS_METERS = 15_000;

export class GetNearbyEstablishments {
  constructor(private readonly repository: EstablishmentRepository) {}

  /**
   * Sin categorías elegidas se muestran todas. `home` es el centro del municipio abierto más cercano: si el
   * cliente está a las afueras (más de 3 km del centro, pero dentro del alcance), el radio crece hasta
   * cubrir el casco urbano; con 3 km fijos el mapa quedaba sin locales.
   */
  execute(origin: GeoPoint, categories: string[] = [], home?: GeoPoint): Promise<Establishment[]> {
    const reach = home ? Math.ceil(distanceMeters(origin, home)) + HOME_RADIUS_METERS : HOME_RADIUS_METERS;
    return this.repository.findNearby({
      origin,
      categories: categories.length ? categories : undefined,
      radiusMeters: Math.min(reach, MAX_RADIUS_METERS),
    });
  }
}
