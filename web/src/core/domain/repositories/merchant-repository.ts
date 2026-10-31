import type { CounterOrder, MerchantOptions, MerchantStore, PartnershipView, StoreMemberInput } from "../entities/merchant";

/** Puerto del portal del comercio aliado (H15.1): sus locales, el mostrador y abrir o pausar. */
export interface MerchantRepository {
  stores(): Promise<{ serverTime: string; stores: MerchantStore[] }>;
  options(): Promise<MerchantOptions>;
  counter(establishmentId: string): Promise<{ serverTime: string; orders: CounterOrder[] }>;
  accept(code: string, preparationMinutes: number): Promise<void>;
  decline(code: string, input: { reason: string; notes?: string }): Promise<void>;
  markReady(code: string): Promise<void>;
  setOpen(establishmentId: string, open: boolean): Promise<void>;
}

/** Puerto del panel para el convenio y el acceso al portal de cada local (solo el administrador). */
export interface PartnershipRepository {
  view(establishmentId: string): Promise<PartnershipView>;
  start(establishmentId: string, input: { startedOn?: string; endedOn?: string; agreementFileId?: string }): Promise<PartnershipView>;
  end(establishmentId: string, input: { endedOn?: string }): Promise<PartnershipView>;
  addMember(establishmentId: string, input: StoreMemberInput): Promise<PartnershipView>;
  revokeMember(establishmentId: string, staffId: string): Promise<PartnershipView>;
}
