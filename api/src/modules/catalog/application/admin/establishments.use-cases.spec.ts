import { admin, InMemoryEstablishments, operatorOf } from '../../../../../test/catalog/fakes';
import {
  ChangeEstablishmentStatusUseCase,
  CreateEstablishmentUseCase,
  EstablishmentInput,
  EstablishmentValidator,
  GetEstablishmentAdminUseCase,
  UpdateEstablishmentUseCase,
} from './establishments.use-cases';

const input = (overrides: Partial<EstablishmentInput> = {}): EstablishmentInput => ({
  name: '  Asadero   El Chontaduro ',
  addressLine: 'Calle 5 # 3-20',
  location: { lat: 1.03, lng: -76.615 },
  area: [
    [-76.61515, 1.0299],
    [-76.61485, 1.0299],
    [-76.61485, 1.0301],
    [-76.61515, 1.0301],
  ],
  categories: ['restaurant', 'FAST_FOOD', 'RESTAURANT'],
  phones: [{ phone: '310 987 6543', label: 'Pedidos' }, { phone: '+57 3109876543' }],
  ...overrides,
});

function setup() {
  const repository = new InMemoryEstablishments();
  const validator = new EstablishmentValidator(repository);
  return {
    repository,
    create: new CreateEstablishmentUseCase(repository, validator),
    update: new UpdateEstablishmentUseCase(repository, validator),
    get: new GetEstablishmentAdminUseCase(repository),
    status: new ChangeEstablishmentStatusUseCase(repository),
  };
}

describe('Establecimientos en el panel (H02.1)', () => {
  it('crea en borrador con datos normalizados y el municipio único lanzado', async () => {
    const { repository, create } = setup();
    const id = await create.execute(admin, input());
    const row = repository.rows.get(id)!;
    expect(row).toMatchObject({ status: 'DRAFT', municipalityId: 1, name: 'Asadero El Chontaduro', categories: ['RESTAURANT', 'FAST_FOOD'] });
    expect(row.phones).toEqual([{ phone: '+573109876543', label: 'Pedidos' }]);
  });

  it('rechaza un área que no contiene el punto, un punto fuera del municipio y categorías desconocidas', async () => {
    const { repository, create } = setup();
    await expect(create.execute(admin, input({ location: { lat: 1.031, lng: -76.615 } }))).rejects.toMatchObject({ code: 'AREA_MUST_COVER_LOCATION' });
    await expect(create.execute(admin, input({ categories: ['NOPE'] }))).rejects.toMatchObject({ code: 'UNKNOWN_CATEGORY' });
    await expect(create.execute(admin, input({ categories: [] }))).rejects.toMatchObject({ code: 'CATEGORY_REQUIRED' });
    await expect(create.execute(admin, input({ phones: [{ phone: '123' }] }))).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    await expect(create.execute(admin, input({ logoFileId: 'f-no' }))).rejects.toMatchObject({ code: 'FILE_NOT_USABLE' });
    repository.boundaryCovers = false;
    await expect(create.execute(admin, input())).rejects.toMatchObject({ code: 'LOCATION_OUTSIDE_MUNICIPALITY' });
  });

  it('no repite el nombre en el municipio (sin distinguir mayúsculas), salvo al editar el mismo local', async () => {
    const { create, update } = setup();
    const id = await create.execute(admin, input());
    await expect(create.execute(admin, input({ name: 'asadero el chontaduro' }))).rejects.toMatchObject({ code: 'ESTABLISHMENT_NAME_TAKEN' });
    await expect(update.execute(admin, id, input({ addressLine: 'Carrera 2' }))).resolves.toBeUndefined();
  });

  it('el operador solo ve y edita los locales de su municipio (404 fuera de su alcance)', async () => {
    const { create, update, get } = setup();
    const id = await create.execute(operatorOf(1), input());
    await expect(get.execute(operatorOf(2), id)).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
    await expect(update.execute(operatorOf(2), id, input())).rejects.toMatchObject({ code: 'ESTABLISHMENT_NOT_FOUND' });
    await expect(get.execute(admin, id)).resolves.toMatchObject({ id });
  });

  it('activa solo con menú y respeta las transiciones permitidas', async () => {
    const { repository, create, status } = setup();
    const id = await create.execute(admin, input());
    await expect(status.execute(admin, { id, to: 'ACTIVE' })).rejects.toMatchObject({ code: 'ESTABLISHMENT_MENU_EMPTY' });
    await expect(status.execute(admin, { id, to: 'TEMPORARILY_CLOSED' })).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    repository.orderable.set(id, 2);
    await status.execute(admin, { id, to: 'ACTIVE' });
    await status.execute(admin, { id, to: 'TEMPORARILY_CLOSED' });
    expect(repository.rows.get(id)!.status).toBe('TEMPORARILY_CLOSED');
    await expect(status.execute(admin, { id, to: 'TEMPORARILY_CLOSED' })).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });
});
