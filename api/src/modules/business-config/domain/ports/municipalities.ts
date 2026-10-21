export interface MunicipalityInfo {
  id: number;
  name: string;
  timeZone: string;
  center: { lat: number; lng: number };
  launched: boolean;
}

/** Lo que un municipio necesita antes de abrir: cobertura (alguna zona), horario y comisión. */
export interface MunicipalityReadiness {
  coverage: boolean;
  hours: boolean;
  commission: boolean;
}

/** Municipios donde se configura la operación. `scope` nulo = todos (administrador global). */
export abstract class MunicipalityDirectory {
  abstract list(scope: number | null): Promise<MunicipalityInfo[]>;
  abstract find(id: number): Promise<MunicipalityInfo | null>;
  abstract readiness(ids: number[]): Promise<Map<number, MunicipalityReadiness>>;
  /** Abre (`launched_at = now()`) o pausa el municipio, y opcionalmente mueve el centro donde arranca el mapa. */
  abstract update(id: number, change: { launched?: boolean; center?: { lat: number; lng: number } }, actorUserId: string): Promise<void>;
}
