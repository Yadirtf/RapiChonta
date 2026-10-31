import type { CounterOrder, MerchantOptions, MerchantStore, PartnershipView } from "@/core/domain/entities/merchant";
import type { MerchantRepository, PartnershipRepository } from "@/core/domain/repositories/merchant-repository";
import { apiRequest, resolveApiAsset } from "../http/api-client";

const id = encodeURIComponent;

export class HttpMerchantRepository implements MerchantRepository {
  async stores() {
    const result = await apiRequest<{
      serverTime: string;
      stores: MerchantStore[];
    }>("GET", "/merchant/stores");
    return {
      ...result,
      stores: result.stores.map((s) => ({
        ...s,
        logoUrl: s.logoUrl && resolveApiAsset(s.logoUrl),
      })),
    };
  }

  options() {
    return apiRequest<MerchantOptions>("GET", "/merchant/options");
  }

  counter(establishmentId: string) {
    return apiRequest<{ serverTime: string; orders: CounterOrder[] }>("GET", `/merchant/stores/${id(establishmentId)}/orders`);
  }

  async accept(code: string, preparationMinutes: number) {
    await apiRequest<unknown>("POST", `/merchant/orders/${id(code)}/accept`, {
      body: { preparationMinutes },
    });
  }

  async decline(code: string, input: { reason: string; notes?: string }) {
    await apiRequest<unknown>("POST", `/merchant/orders/${id(code)}/decline`, {
      body: input,
    });
  }

  async markReady(code: string) {
    await apiRequest<unknown>("POST", `/merchant/orders/${id(code)}/ready`);
  }

  async setOpen(establishmentId: string, open: boolean) {
    await apiRequest<unknown>("POST", `/merchant/stores/${id(establishmentId)}/availability`, { body: { open } });
  }
}

const withUrls = (view: PartnershipView): PartnershipView => {
  const fix = <T extends { agreementUrl: string | null } | null>(p: T): T =>
    (p && {
      ...p,
      agreementUrl: p.agreementUrl && resolveApiAsset(p.agreementUrl),
    }) as T;
  return {
    ...view,
    current: fix(view.current),
    upcoming: fix(view.upcoming),
    past: view.past.map(fix),
  };
};

export class HttpPartnershipRepository implements PartnershipRepository {
  async view(establishmentId: string) {
    return withUrls(await apiRequest<PartnershipView>("GET", `/admin/establishments/${id(establishmentId)}/partnership`));
  }

  async start(establishmentId: string, input: Parameters<PartnershipRepository["start"]>[1]) {
    return withUrls(await apiRequest<PartnershipView>("POST", `/admin/establishments/${id(establishmentId)}/partnership`, { body: input }));
  }

  async end(establishmentId: string, input: Parameters<PartnershipRepository["end"]>[1]) {
    return withUrls(await apiRequest<PartnershipView>("POST", `/admin/establishments/${id(establishmentId)}/partnership/end`, { body: input }));
  }

  async addMember(establishmentId: string, input: Parameters<PartnershipRepository["addMember"]>[1]) {
    return withUrls(await apiRequest<PartnershipView>("POST", `/admin/establishments/${id(establishmentId)}/staff`, { body: input }));
  }

  async revokeMember(establishmentId: string, staffId: string) {
    return withUrls(await apiRequest<PartnershipView>("DELETE", `/admin/establishments/${id(establishmentId)}/staff/${id(staffId)}`));
  }
}
