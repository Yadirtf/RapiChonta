import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../../../../shared/presentation/public.decorator';
import { FindNearbyEstablishmentsUseCase } from '../../application/public/find-nearby-establishments.use-case';
import { GetEstablishmentUseCase } from '../../application/public/get-establishment.use-case';
import { PublicCatalogRepository } from '../../domain/ports/public-catalog.repository';
import { CatalogPresenter } from './catalog-presenter';
import { EstablishmentQueryDto, FindNearbyQueryDto } from './dto/public.dto';

/** Lo que ve el cliente sin iniciar sesión: categorías, mapa y ficha con menú (H02.4, H02.5). */
@Public()
@Controller()
export class PublicCatalogController {
  constructor(
    private readonly catalog: PublicCatalogRepository,
    private readonly findNearby: FindNearbyEstablishmentsUseCase,
    private readonly getEstablishment: GetEstablishmentUseCase,
    private readonly presenter: CatalogPresenter,
  ) {}

  /** GET /api/v1/catalog/categories — categorías activas con su nombre en cada idioma. */
  @Get('catalog/categories')
  @Header('Cache-Control', 'public, max-age=300')
  categories() {
    return this.catalog.categories();
  }

  /** GET /api/v1/establishments/nearby?lat=1.03&lng=-76.62&radius=3000&categories=FAST_FOOD,PHARMACY */
  @Get('establishments/nearby')
  async nearby(@Query() query: FindNearbyQueryDto) {
    const results = await this.findNearby.execute({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radius,
      categories: query.categories,
      limit: query.limit,
    });
    return results.map((e) => this.presenter.mapItem(e));
  }

  /** GET /api/v1/establishments/:id?lang=en&lat=..&lng=.. — ficha con el menú visible. */
  @Get('establishments/:id')
  async establishment(@Param('id', ParseUUIDPipe) id: string, @Query() query: EstablishmentQueryDto) {
    const origin = query.lat !== undefined && query.lng !== undefined ? { latitude: query.lat, longitude: query.lng } : undefined;
    return this.presenter.establishment(await this.getEstablishment.execute({ id, language: query.lang, origin }));
  }
}
