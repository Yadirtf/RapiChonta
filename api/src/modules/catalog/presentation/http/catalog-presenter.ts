import { Injectable } from '@nestjs/common';
import { FileUrls } from '../../../files/application/file-urls';
import { EstablishmentDetail, EstablishmentSummary } from '../../domain/ports/establishment-admin.repository';
import { AdminMenu, AdminMenuProduct } from '../../domain/ports/menu.repository';
import { MapEstablishment, PublicEstablishment } from '../../domain/ports/public-catalog.repository';

/** Respuestas HTTP del catálogo: ids de archivo → URLs firmadas que vencen (RNF-08). */
@Injectable()
export class CatalogPresenter {
  constructor(private readonly urls: FileUrls) {}

  mapItem(e: MapEstablishment) {
    return {
      id: e.id,
      name: e.name,
      category: e.category,
      categoryIcon: e.categoryIcon,
      address: e.address,
      acceptsOrders: e.acceptsOrders,
      logoUrl: this.urls.url(e.logoFileId),
      location: { lat: e.location.latitude, lng: e.location.longitude },
      distanceMeters: e.distanceMeters,
    };
  }

  establishment(e: PublicEstablishment) {
    return {
      id: e.id,
      name: e.name,
      address: e.address,
      status: e.status,
      acceptsOrders: e.acceptsOrders,
      location: { lat: e.location.latitude, lng: e.location.longitude },
      distanceMeters: e.distanceMeters,
      logoUrl: this.urls.url(e.logoFileId),
      categories: e.categories,
      sections: e.sections.map((s) => ({
        id: s.id,
        name: s.name,
        products: s.products.map(({ imageFileId, ...p }) => ({ ...p, imageUrl: this.urls.url(imageFileId) })),
      })),
    };
  }

  summary(e: EstablishmentSummary) {
    const { logoFileId, ...rest } = e;
    return { ...rest, logoFileId, logoUrl: this.urls.url(logoFileId) };
  }

  detail(e: EstablishmentDetail) {
    return this.summary(e) as ReturnType<CatalogPresenter['summary']> & Omit<EstablishmentDetail, keyof EstablishmentSummary>;
  }

  private product(p: AdminMenuProduct) {
    return { ...p, images: p.imageFileIds.map((fileId) => ({ fileId, url: this.urls.url(fileId) })) };
  }

  menu(menu: AdminMenu) {
    return {
      establishmentId: menu.establishmentId,
      sections: menu.sections.map((s) => ({ ...s, products: s.products.map((p) => this.product(p)) })),
      discontinued: menu.discontinued.map((p) => this.product(p)),
    };
  }
}
