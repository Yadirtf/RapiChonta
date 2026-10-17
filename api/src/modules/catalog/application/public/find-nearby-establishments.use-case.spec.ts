import { CategoryView, MapEstablishment, NearbyQuery, PublicCatalogRepository, PublicEstablishment } from '../../domain/ports/public-catalog.repository';
import { FindNearbyEstablishmentsUseCase } from './find-nearby-establishments.use-case';

class FakePublicCatalog extends PublicCatalogRepository {
  lastQuery?: NearbyQuery;
  async categories(): Promise<CategoryView[]> {
    return [];
  }
  async nearby(query: NearbyQuery): Promise<MapEstablishment[]> {
    this.lastQuery = query;
    return [];
  }
  async establishment(): Promise<PublicEstablishment | null> {
    return null;
  }
}

describe('FindNearbyEstablishmentsUseCase', () => {
  it('aplica radio y límite por defecto y quita categorías repetidas', async () => {
    const repository = new FakePublicCatalog();
    await new FindNearbyEstablishmentsUseCase(repository).execute({ latitude: 1.0294, longitude: -76.6165, categories: ['FAST_FOOD', 'FAST_FOOD'] });
    expect(repository.lastQuery).toMatchObject({ radiusMeters: 3000, limit: 50, categories: ['FAST_FOOD'] });
  });

  it('rechaza radios fuera de rango y coordenadas inválidas', async () => {
    const useCase = new FindNearbyEstablishmentsUseCase(new FakePublicCatalog());
    await expect(useCase.execute({ latitude: 1, longitude: -76, radiusMeters: 50_000 })).rejects.toMatchObject({ code: 'INVALID_RADIUS' });
    await expect(useCase.execute({ latitude: 95, longitude: -76 })).rejects.toMatchObject({ code: 'INVALID_LOCATION' });
  });
});
