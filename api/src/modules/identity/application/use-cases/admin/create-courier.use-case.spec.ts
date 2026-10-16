import { FakeHasher, InMemoryAccounts } from '../../../../../../test/identity/fakes';
import { Principal } from '../../../domain/principal';
import { CourierRepository, NewCourier } from '../../../domain/ports/courier.repository';
import { IdentityOptions, IdentityOptionsRepository } from '../../../domain/ports/identity-options.repository';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { CreateCourierInput, CreateCourierUseCase } from './create-courier.use-case';

class RecordingCouriers extends CourierRepository {
  created: NewCourier[] = [];
  async create(courier: NewCourier) {
    this.created.push(courier);
    return 'courier-1';
  }
  list = jest.fn();
  findById = jest.fn();
  currentVerification = jest.fn();
  isTransitionAllowed = jest.fn();
  changeVerification = jest.fn();
}

class StaticOptions extends IdentityOptionsRepository {
  async load(): Promise<IdentityOptions> {
    return {
      documentTypes: ['CC', 'CE'],
      vehicleTypes: [
        { code: 'MOTORCYCLE', requiresPlate: true },
        { code: 'BICYCLE', requiresPlate: false },
      ],
      fundingModes: ['CASH_BOX', 'OWN_FUNDS'],
      paymentMethods: [
        { code: 'NEQUI', requiresBank: false },
        { code: 'BANK_TRANSFER', requiresBank: true },
      ],
      banks: [{ code: 'BANCOLOMBIA', name: 'Bancolombia' }],
      bankAccountTypes: ['SAVINGS'],
      municipalities: [{ id: 1, name: 'Villagarzón' }],
    };
  }
}

const admin: Principal = { userId: 'admin-1', sessionId: 's', role: 'ADMIN', permissions: new Set(), municipalityId: null };

const input = (overrides: Partial<CreateCourierInput> = {}): CreateCourierInput => ({
  givenNames: 'Carlos',
  familyNames: 'Gómez',
  documentType: 'CC',
  documentNumber: '1.122.334.455',
  phone: '320 555 0000',
  password: 'Domicilio2026!',
  municipalityId: 1,
  fundingMode: 'CASH_BOX',
  vehicle: { type: 'MOTORCYCLE', plate: 'abc 12d' },
  collectionAccounts: [{ paymentMethod: 'NEQUI', accountNumber: '320 555 0000', holderName: 'Carlos Gómez' }],
  ...overrides,
});

describe('CreateCourierUseCase (H01.3)', () => {
  let accounts: InMemoryAccounts;
  let couriers: RecordingCouriers;
  let useCase: CreateCourierUseCase;

  beforeEach(() => {
    accounts = new InMemoryAccounts();
    couriers = new RecordingCouriers();
    useCase = new CreateCourierUseCase(accounts, couriers, new StaticOptions(), new FakeHasher());
  });

  it('normaliza documento, placa y cuenta, y guarda solo el hash de la contraseña', async () => {
    await useCase.execute(admin, input());
    expect(couriers.created[0]).toMatchObject({
      documentNumber: '1122334455',
      vehicle: { plate: 'ABC12D' },
      collectionAccounts: [{ accountNumber: '3205550000' }],
      passwordHash: 'hashed:Domicilio2026!',
      createdByUserId: 'admin-1',
    });
    expect(couriers.created[0].phone.e164).toBe('+573205550000');
  });

  it('exige placa para moto y banco para transferencia', async () => {
    await expect(useCase.execute(admin, input({ vehicle: { type: 'MOTORCYCLE' } }))).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    await expect(
      useCase.execute(admin, input({ collectionAccounts: [{ paymentMethod: 'BANK_TRANSFER', accountNumber: '123456', holderName: 'Carlos' }] })),
    ).rejects.toMatchObject({ code: 'INVALID_OPTION', details: { field: 'collectionAccounts.bank' } });
  });

  it('rechaza una contraseña débil', async () => {
    await expect(useCase.execute(admin, input({ password: '12345' }))).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('si el número ya es de un cliente, le agrega el rol en vez de duplicar la persona', async () => {
    const customer = accounts.add({ phone: PhoneNumber.parse('3205550000') });
    await useCase.execute(admin, input());
    expect(couriers.created[0].existingUserId).toBe(customer.userId);
  });

  it('no convierte en domiciliario a alguien que ya lo es', async () => {
    accounts.add({ phone: PhoneNumber.parse('3205550000'), roles: [{ code: 'COURIER', municipalityId: 1, requiresPassword: true }] });
    await expect(useCase.execute(admin, input())).rejects.toMatchObject({ code: 'ROLE_ALREADY_GRANTED' });
  });
});
