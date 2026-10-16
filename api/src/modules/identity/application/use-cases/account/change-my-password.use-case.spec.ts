import { FakeHasher, InMemoryAccounts, InMemoryOtpChallenges, InMemorySessions } from '../../../../../../test/identity/fakes';
import { Principal } from '../../../domain/principal';
import { ChangeMyPasswordUseCase } from './change-my-password.use-case';

describe('Cambiar mi contraseña (H01.4)', () => {
  it('guarda la nueva contraseña y cierra las demás sesiones, no la actual', async () => {
    const accounts = new InMemoryAccounts();
    const sessions = new InMemorySessions();
    const account = accounts.add({ passwordHash: 'hashed:ClaveAnterior1', roles: [{ code: 'OPERATOR', municipalityId: 1, requiresPassword: true }] });
    const current = await sessions.create({ userId: account.userId, role: 'OPERATOR', refreshTokenHash: 'a', refreshExpiresAt: new Date(Date.now() + 1e6) });
    const other = await sessions.create({ userId: account.userId, role: 'OPERATOR', refreshTokenHash: 'b', refreshExpiresAt: new Date(Date.now() + 1e6) });
    const principal: Principal = { userId: account.userId, sessionId: current, role: 'OPERATOR', permissions: new Set(), municipalityId: 1 };

    await new ChangeMyPasswordUseCase(accounts, new FakeHasher(), new InMemoryOtpChallenges(), sessions).execute(principal, {
      currentPassword: 'ClaveAnterior1',
      newPassword: 'Nueva clave segura',
    });

    expect(accounts.accounts.get(account.userId)?.passwordHash).toBe('hashed:Nueva clave segura');
    expect(sessions.sessions.get(current)?.endedAt).toBeNull();
    expect(sessions.sessions.get(other)?.endReason).toBe('PASSWORD_CHANGED');
  });

  it('rechaza la contraseña actual incorrecta sin tocar las sesiones', async () => {
    const accounts = new InMemoryAccounts();
    const sessions = new InMemorySessions();
    const account = accounts.add({ passwordHash: 'hashed:ClaveAnterior1' });
    const other = await sessions.create({ userId: account.userId, role: 'COURIER', refreshTokenHash: 'b', refreshExpiresAt: new Date(Date.now() + 1e6) });
    const principal: Principal = { userId: account.userId, sessionId: 'x', role: 'COURIER', permissions: new Set(), municipalityId: null };

    await expect(
      new ChangeMyPasswordUseCase(accounts, new FakeHasher(), new InMemoryOtpChallenges(), sessions).execute(principal, {
        currentPassword: 'otra',
        newPassword: 'Nueva clave segura',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(sessions.sessions.get(other)?.endedAt).toBeNull();
  });
});
