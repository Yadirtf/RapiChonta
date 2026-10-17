import type { Category, Establishment, EstablishmentDetail } from "@/core/domain/entities/establishment";
import type { EstablishmentRepository } from "@/core/domain/repositories/establishment-repository";
import { apiGet, resolveApiAsset } from "../http/api-client";

export class HttpEstablishmentRepository implements EstablishmentRepository {
  async findNearby({ origin, radiusMeters, categories }: Parameters<EstablishmentRepository["findNearby"]>[0]) {
    const items = await apiGet<Establishment[]>("/establishments/nearby", {
      lat: origin.lat,
      lng: origin.lng,
      radius: radiusMeters,
      categories: categories?.join(","),
    });
    return items.map((e) => ({ ...e, logoUrl: resolveApiAsset(e.logoUrl) }));
  }

  categories() {
    return apiGet<Category[]>("/catalog/categories");
  }

  async findById(id: string, { language, origin }: Parameters<EstablishmentRepository["findById"]>[1]) {
    const detail = await apiGet<EstablishmentDetail>(`/establishments/${encodeURIComponent(id)}`, {
      lang: language,
      lat: origin?.lat,
      lng: origin?.lng,
    });
    return {
      ...detail,
      logoUrl: resolveApiAsset(detail.logoUrl),
      sections: detail.sections.map((s) => ({ ...s, products: s.products.map((p) => ({ ...p, imageUrl: resolveApiAsset(p.imageUrl) })) })),
    };
  }
}
