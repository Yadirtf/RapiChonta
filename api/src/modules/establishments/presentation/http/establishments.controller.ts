import { Controller, Get, Query } from '@nestjs/common';
import { FindNearbyEstablishmentsUseCase } from '../../application/use-cases/find-nearby-establishments.use-case';
import { FindNearbyQueryDto } from './dto/find-nearby.query.dto';

@Controller('establishments')
export class EstablishmentsController {
  constructor(private readonly findNearby: FindNearbyEstablishmentsUseCase) {}

  /** GET /api/v1/establishments/nearby?lat=4.61&lng=-74.08&radius=3000&categories=FAST_FOOD */
  @Get('nearby')
  async nearby(@Query() query: FindNearbyQueryDto) {
    const results = await this.findNearby.execute({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radius,
      categories: query.categories,
      limit: query.limit,
    });

    return results.map(({ establishment: e, distanceMeters }) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      address: e.address,
      isPartner: e.isPartner,
      logoUrl: e.logoUrl ?? null,
      location: { lat: e.location.latitude, lng: e.location.longitude },
      distanceMeters,
    }));
  }
}
