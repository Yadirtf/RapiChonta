import { Injectable, Logger } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { PlannedRoute, RoutePlanner } from '../domain/ports/route-planner';

export interface RoutingConfig {
  /** Clave de OpenRouteService (gratis, ~2.000 rutas al día). Sin clave se usa OSRM. */
  orsApiKey?: string;
  /** Servidor OSRM: por defecto el público de demostración (sin garantía; sirve para pruebas, no para producción). */
  osrmUrl: string;
}

/** Cuánto vale una ruta pedida desde casi el mismo punto (≈ 11 m): el GPS se mueve poco entre dos consultas. */
const CACHE_MS = 2 * 60_000;
const CACHE_MAX = 500;
const key = (from: GeoPoint, to: GeoPoint) => [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(4)).join(',');

type Source = { name: string; fetch: (from: GeoPoint, to: GeoPoint) => Promise<PlannedRoute> };

const timeout = () => AbortSignal.timeout(8_000);

async function json(response: Response): Promise<any> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** OpenRouteService, perfil carro (no tiene perfil de moto; respeta los sentidos de las vías). */
function openRouteService(apiKey: string): Source {
  return {
    name: 'openrouteservice',
    fetch: async (from, to) => {
      const body = await json(
        await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
          method: 'POST',
          signal: timeout(),
          headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
          body: JSON.stringify({ coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]], instructions: false }),
        }),
      );
      const feature = body?.features?.[0];
      if (!feature) throw new Error('respuesta sin ruta');
      return { line: feature.geometry.coordinates, distanceMeters: feature.properties.summary.distance ?? 0, durationSeconds: feature.properties.summary.duration ?? 0 };
    },
  };
}

function osrm(baseUrl: string): Source {
  return {
    name: 'osrm',
    fetch: async (from, to) => {
      const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
      const body = await json(await fetch(`${baseUrl.replace(/\/$/, '')}/route/v1/driving/${path}?overview=full&geometries=geojson`, { signal: timeout() }));
      const route = body?.code === 'Ok' ? body.routes?.[0] : null;
      if (!route) throw new Error(`respuesta sin ruta (${body?.code})`);
      return { line: route.geometry.coordinates, distanceMeters: route.distance, durationSeconds: route.duration };
    },
  };
}

@Injectable()
export class HttpRoutePlanner extends RoutePlanner {
  private readonly logger = new Logger('RoutePlanner');
  private readonly source: Source;
  private readonly cache = new Map<string, { at: number; route: PlannedRoute }>();

  constructor(config: RoutingConfig) {
    super();
    this.source = config.orsApiKey ? openRouteService(config.orsApiKey) : osrm(config.osrmUrl);
    this.logger.log(`Rutas con ${this.source.name}`);
  }

  async plan(from: GeoPoint, to: GeoPoint, now = Date.now()): Promise<PlannedRoute | null> {
    const k = key(from, to);
    const hit = this.cache.get(k);
    if (hit && now - hit.at < CACHE_MS) return hit.route;
    try {
      const route = await this.source.fetch(from, to);
      if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(k, { at: now, route });
      return route;
    } catch (error) {
      this.logger.warn(`Sin ruta de ${this.source.name}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
