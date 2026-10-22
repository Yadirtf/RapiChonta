/** Opciones de los formularios del panel (catálogos vigentes). */
export interface IdentityOptions {
  documentTypes: string[];
  vehicleTypes: { code: string; requiresPlate: boolean }[];
  fundingModes: string[];
  paymentMethods: { code: string; requiresBank: boolean }[];
  banks: { code: string; name: string }[];
  bankAccountTypes: string[];
  /** Primero los que ya operan (`launched`): un domiciliario de un municipio sin operación no ve pedidos. */
  municipalities: { id: number; name: string; launched: boolean }[];
}

export abstract class IdentityOptionsRepository {
  abstract load(): Promise<IdentityOptions>;
}
