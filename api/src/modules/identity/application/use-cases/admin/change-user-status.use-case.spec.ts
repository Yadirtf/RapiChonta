import { InMemoryAccounts } from '../../../../../../test/identity/fakes';
import { Principal } from '../../../domain/principal';
import { StaffRepository } from '../../../domain/ports/staff.repository';
import { ChangeUserStatusUseCase } from './change-user-status.use-case';

class AllowAllTransitions extends StaffRepository {
  create = jest.fn();
  list = jest.fn();
  async isUserStatusTransitionAllowed() {
    return true;
  }
}

const principal = (permissions: string[], userId = 'admin-1'): Principal => ({
  userId,
  sessionId: 's',
  role: 'ADMIN',
  permissions: new Set(permissions),
  municipalityId: null,
});

describe('ChangeUserStatusUseCase (H01.3, H01.4)', () => {
  let accounts: InMemoryAccounts;
  let useCase: ChangeUserStatusUseCase;

  beforeEach(() => {
    accounts = new InMemoryAccounts();
    useCase = new ChangeUserStatusUseCase(accounts, new AllowAllTransitions());
  });

  it('el administrador desactiva a un domiciliario', async () => {
    const courier = accounts.add({ roles: [{ code: 'COURIER', municipalityId: 1, requiresPassword: true }] });
    await useCase.execute(principal(['couriers.manage']), { userId: courier.userId, to: 'DEACTIVATED' });
    expect(accounts.statusChanges).toEqual([expect.objectContaining({ userId: courier.userId, to: 'DEACTIVATED' })]);
  });

  it('sin el permiso de la clase de cuenta responde 404 (no revela que existe)', async () => {
    const operator = accounts.add({ roles: [{ code: 'OPERATOR', municipalityId: 1, requiresPassword: true }] });
    await expect(useCase.execute(principal(['couriers.manage']), { userId: operator.userId, to: 'DEACTIVATED' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('nadie cambia el estado de su propia cuenta', async () => {
    await expect(useCase.execute(principal(['users.manage_staff']), { userId: 'admin-1', to: 'SUSPENDED' })).rejects.toMatchObject({
      code: 'CANNOT_CHANGE_OWN_STATUS',
    });
  });

  it('CLOSED solo se alcanza con la solicitud de eliminación del titular', async () => {
    const customer = accounts.add({});
    await expect(useCase.execute(principal(['users.manage_staff']), { userId: customer.userId, to: 'CLOSED' })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });
});
