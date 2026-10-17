export interface MunicipalityInfo {
  id: number;
  name: string;
  timeZone: string;
  center: { lat: number; lng: number };
  launched: boolean;
}

/** Municipios donde se configura la operación. `scope` nulo = todos (administrador global). */
export abstract class MunicipalityDirectory {
  abstract list(scope: number | null): Promise<MunicipalityInfo[]>;
  abstract find(id: number): Promise<MunicipalityInfo | null>;
}
