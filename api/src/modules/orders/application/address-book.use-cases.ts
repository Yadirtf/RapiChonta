import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../catalog/domain/value-objects/geo-point';
import { Principal } from '../../identity/domain/principal';
import { OrderErrors } from '../domain/orders.errors';
import { AddressBook, RecipientBook, SavedAddress } from '../domain/ports/address-book';

/** Suficiente para casa, trabajo, la finca y los familiares; evita listas que nadie revisa. */
export const MAX_SAVED_ADDRESSES = 10;

const clean = (value: string | null | undefined, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '') || null;

/** H04.2: direcciones guardadas para reutilizarlas. Editar es archivar y crear otra (los pedidos no cambian). */
@Injectable()
export class ManageAddressesUseCase {
  constructor(private readonly addresses: AddressBook) {}

  list(principal: Principal): Promise<SavedAddress[]> {
    return this.addresses.list(principal.userId);
  }

  async create(principal: Principal, input: { label: string; line?: string | null; reference: string; latitude: number; longitude: number }): Promise<SavedAddress> {
    const label = clean(input.label, 40);
    if (!label) throw OrderErrors.labelRequired();
    const reference = clean(input.reference, 200);
    if (!reference || reference.length < 3) throw OrderErrors.referenceRequired();
    const location = GeoPoint.create(input.latitude, input.longitude);
    const saved = await this.addresses.list(principal.userId);
    const replaces = saved.some((a) => a.label!.toLowerCase() === label.toLowerCase());
    if (!replaces && saved.length >= MAX_SAVED_ADDRESSES) throw OrderErrors.tooManyAddresses(MAX_SAVED_ADDRESSES);
    return this.addresses.create(principal.userId, { label, line: clean(input.line, 200), reference, location });
  }

  async archive(principal: Principal, id: string): Promise<void> {
    if (!(await this.addresses.archive(principal.userId, id))) throw OrderErrors.addressNotFound();
  }

  async makeDefault(principal: Principal, id: string): Promise<void> {
    if (!(await this.addresses.setDefault(principal.userId, id))) throw OrderErrors.addressNotFound();
  }
}

/** Destinatarios guardados (pedidos para otra persona). Se crean al confirmar un pedido para alguien nuevo. */
@Injectable()
export class ManageRecipientsUseCase {
  constructor(private readonly recipients: RecipientBook) {}

  list(principal: Principal) {
    return this.recipients.list(principal.userId);
  }

  async archive(principal: Principal, id: string): Promise<void> {
    if (!(await this.recipients.archive(principal.userId, id))) throw OrderErrors.recipientNotFound();
  }
}
