import { DomainError } from '../../../../../shared/domain/domain.error';
import { Principal } from '../../../domain/principal';
import { CourierRepository, MunicipalityChange } from '../../../domain/ports/courier.repository';
import { IdentityOptionsRepository } from '../../../domain/ports/identity-options.repository';
import { ChangeCourierMunicipalityUseCase } from './change-courier-municipality.use-case';

const options = {
  load: async () => ({
    municipalities: [
      { id: 1, name: 'Villagarzón', launched: true },
      { id: 2, name: 'Colón', launched: false },
    ],
  }),
} as unknown as IdentityOptionsRepository;

const admin: Principal = { userId: 'admin-1', sessionId: 's', role: 'ADMIN', permissions: new Set(), municipalityId: null };

const setup = (result: MunicipalityChange = 'CHANGED') => {
  const changeMunicipality = jest.fn().mockResolvedValue(result);
  const couriers = { changeMunicipality } as unknown as CourierRepository;
  return { changeMunicipality, useCase: new ChangeCourierMunicipalityUseCase(couriers, options) };
};

const codeOf = async (work: Promise<unknown>) => ((await work.then(() => null, (e: DomainError) => e)) as DomainError | null)?.code;

describe('ChangeCourierMunicipalityUseCase', () => {
  it('mueve al domiciliario y deja constancia de quién lo hizo', async () => {
    const { useCase, changeMunicipality } = setup();
    await useCase.execute(admin, { userId: 'edwar', municipalityId: 1 });
    expect(changeMunicipality).toHaveBeenCalledWith({ userId: 'edwar', municipalityId: 1, changedByUserId: 'admin-1' });
  });

  it('el mismo municipio no es un error', async () => {
    const { useCase } = setup('SAME');
    await expect(useCase.execute(admin, { userId: 'edwar', municipalityId: 1 })).resolves.toBeUndefined();
  });

  it('rechaza municipios inexistentes, fuera del alcance, domiciliarios desconocidos y con pedido en curso', async () => {
    expect(await codeOf(setup().useCase.execute(admin, { userId: 'edwar', municipalityId: 99 }))).toBe('INVALID_OPTION');
    expect(await codeOf(setup().useCase.execute({ ...admin, municipalityId: 2 }, { userId: 'edwar', municipalityId: 1 }))).toBe('MUNICIPALITY_OUT_OF_SCOPE');
    expect(await codeOf(setup('NOT_FOUND').useCase.execute(admin, { userId: 'nadie', municipalityId: 1 }))).toBe('COURIER_NOT_FOUND');
    expect(await codeOf(setup('HAS_ACTIVE_ORDER').useCase.execute(admin, { userId: 'edwar', municipalityId: 1 }))).toBe('COURIER_ON_ACTIVE_ORDER');
  });
});
