/** Opciones de los formularios del panel (catálogos vigentes). */
export interface IdentityOptions {
  documentTypes: string[];
  vehicleTypes: { code: string; requiresPlate: boolean }[];
  fundingModes: string[];
  paymentMethods: { code: string; requiresBank: boolean }[];
  banks: { code: string; name: string }[];
  bankAccountTypes: string[];
  municipalities: { id: number; name: string }[];
}

export abstract class IdentityOptionsRepository {
  abstract load(): Promise<IdentityOptions>;
}
