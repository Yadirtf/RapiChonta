import { PolygonLimits } from '../../../catalog/domain/value-objects/geo-polygon';

/**
 * Límites del polígono de una zona de entrega (H03.1): desde una cuadra hasta un grupo de veredas.
 * El área se valida igual que la de un local (anillo simple, sin cruces); solo cambian los rangos.
 */
export const ZONE_LIMITS: PolygonLimits = { minVertices: 3, maxVertices: 300, minSquareMeters: 1_000, maxSquareMeters: 300_000_000 };

/** La cobertura de un municipio puede ser mayor que cualquier zona: un radio de 15 km son ~707 km². */
export const COVERAGE_LIMITS: PolygonLimits = { ...ZONE_LIMITS, minSquareMeters: 100_000, maxSquareMeters: 1_000_000_000 };
