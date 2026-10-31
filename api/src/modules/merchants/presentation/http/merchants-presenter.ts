import { Injectable } from '@nestjs/common';
import { FileUrls } from '../../../files/application/file-urls';
import { MerchantStore } from '../../domain/ports/merchant-desk';
import { Partnership, PartnershipView } from '../../domain/ports/partnerships';

/** Cambia los ids de archivo por URLs firmadas (el contrato es privado: solo llega a quien ve la ficha). */
@Injectable()
export class MerchantsPresenter {
  constructor(private readonly urls: FileUrls) {}

  store({ logoFileId, ...store }: MerchantStore) {
    return { ...store, logoUrl: logoFileId ? this.urls.url(logoFileId) : null };
  }

  partnership(view: PartnershipView) {
    const one = (p: Partnership | null) => (p ? { ...p, agreementFileId: undefined, agreementUrl: p.agreementFileId ? this.urls.url(p.agreementFileId) : null } : null);
    return { ...view, current: one(view.current), upcoming: one(view.upcoming), past: view.past.map(one) };
  }
}
