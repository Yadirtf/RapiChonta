import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';

export interface SavedAddress {
  id: string;
  /** Nulo: dirección de un solo uso (la ubicación actual que el cliente no quiso guardar). */
  label: string | null;
  line: string | null;
  reference: string | null;
  location: GeoPoint;
  isDefault: boolean;
  createdAt: Date;
}

export interface NewAddress {
  label: string | null;
  line: string | null;
  reference: string;
  location: GeoPoint;
}

export interface SavedRecipient {
  id: string;
  fullName: string;
  phoneE164: string;
  createdAt: Date;
}

/** Direcciones guardadas del cliente (H04.2). Editar es archivar y crear otra: los pedidos viejos no cambian. */
export abstract class AddressBook {
  /** Solo las guardadas con nombre y vigentes; la predeterminada primero. */
  abstract list(ownerUserId: string): Promise<SavedAddress[]>;
  abstract find(ownerUserId: string, id: string): Promise<SavedAddress | null>;
  /**
   * Guardar con un nombre que ya existe ("Casa") reemplaza esa dirección: la vieja se archiva y la nueva
   * hereda si era la predeterminada. La primera dirección con nombre queda como predeterminada.
   */
  abstract create(ownerUserId: string, data: NewAddress): Promise<SavedAddress>;
  abstract archive(ownerUserId: string, id: string): Promise<boolean>;
  abstract setDefault(ownerUserId: string, id: string): Promise<boolean>;
}

/** Contactos a quienes el cliente envía pedidos (amigo, familiar). No son personas registradas. */
export abstract class RecipientBook {
  abstract list(ownerUserId: string): Promise<SavedRecipient[]>;
  abstract find(ownerUserId: string, id: string): Promise<SavedRecipient | null>;
  abstract archive(ownerUserId: string, id: string): Promise<boolean>;
}
