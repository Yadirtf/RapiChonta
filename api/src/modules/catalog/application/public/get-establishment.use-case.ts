import { Injectable } from '@nestjs/common';
import { CatalogErrors } from '../../domain/catalog.errors';
import { CONTENT_LANGUAGES, ContentLanguage, REQUIRED_LANGUAGE } from '../../domain/catalog.codes';
import { PublicCatalogRepository, PublicEstablishment } from '../../domain/ports/public-catalog.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';

export const contentLanguage = (value?: string): ContentLanguage =>
  (CONTENT_LANGUAGES as readonly string[]).includes(value ?? '') ? (value as ContentLanguage) : REQUIRED_LANGUAGE;

/**
 * Ficha del local con su menú (H02.5): secciones activas y productos visibles con la versión vigente.
 * Un local que no se ve en el mapa (borrador o inactivo) responde 404 al cliente.
 */
@Injectable()
export class GetEstablishmentUseCase {
  constructor(private readonly repository: PublicCatalogRepository) {}

  async execute(input: { id: string; language?: string; origin?: { latitude: number; longitude: number } }): Promise<PublicEstablishment> {
    const origin = input.origin ? GeoPoint.create(input.origin.latitude, input.origin.longitude) : undefined;
    const establishment = await this.repository.establishment(input.id, contentLanguage(input.language), origin);
    if (!establishment) throw CatalogErrors.establishmentNotFound();
    return establishment;
  }
}
