import { InMemoryEstablishmentRepository } from '../../infrastructure/persistence/in-memory-establishment.repository';
import { FindNearbyEstablishmentsUseCase } from './find-nearby-establishments.use-case';

describe('FindNearbyEstablishmentsUseCase', () => {
  const useCase = new FindNearbyEstablishmentsUseCase(new InMemoryEstablishmentRepository());

  it('devuelve establecimientos ordenados por distancia', async () => {
    const results = await useCase.execute({ latitude: 4.6097, longitude: -74.0817 });
    expect(results.length).toBeGreaterThan(0);
    const distances = results.map((r) => r.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});
