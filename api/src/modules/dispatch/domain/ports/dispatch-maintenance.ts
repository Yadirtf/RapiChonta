/** Trabajos con hora del despacho (H07.4 y retención de ubicaciones de RNF-06). */
export abstract class DispatchMaintenance {
  /**
   * Marca EXPIRED a los destinatarios pendientes de ofertas vencidas y devuelve al panel (OFFERED →
   * PENDING_ASSIGNMENT, fuente TIMER) los pedidos que se quedaron sin ofertas vivas. Devuelve cuántos volvieron.
   */
  abstract expireOffers(): Promise<number>;
  /** Cuándo vence la próxima oferta con alguien pendiente. */
  abstract nextExpiry(): Promise<Date | null>;
  /**
   * Cierra (INACTIVITY_TIMEOUT) los turnos Disponible sin ubicación en `idleMinutes` y sin pedido en curso: la app
   * se cerró o el teléfono se apagó. El turno termina en la última lectura, así las horas trabajadas son reales.
   */
  abstract closeIdleAvailability(idleMinutes: number): Promise<number>;
  /** Borra las lecturas de ubicación más viejas que location.retention_days. Devuelve cuántas. */
  abstract purgeLocations(): Promise<number>;
}
