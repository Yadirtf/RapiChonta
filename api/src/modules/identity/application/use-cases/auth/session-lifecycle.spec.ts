import {
  FakeHasher,
  FakePermissions,
  FakeRefreshTokens,
  FakeTokens,
  InMemoryAccounts,
  InMemoryLegal,
  InMemoryOtpChallenges,
  InMemorySessions,
} from '../../../../../../test/identity/fakes';
import { Principal } from '../../../domain/principal';
import { SessionIssuer } from '../../services/session-issuer';
import { AuthenticateUseCase } from './authenticate.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { SignOutUseCase } from './sign-out.use-case';
import { SwitchRoleUseCase } from './switch-role.use-case';

describe('Sesiones (RF-02, RF-06)', () => {
  let sessions: InMemorySessions;
  let accounts: InMemoryAccounts;
  let issuer: SessionIssuer;
  let refresh: RefreshSessionUseCase;
  let authenticate: AuthenticateUseCase;
  const tokens = new FakeTokens();
  const refreshTokens = new FakeRefreshTokens();
  const permissions = new FakePermissions();

  beforeEach(() => {
    sessions = new InMemorySessions();
    accounts = new InMemoryAccounts();
    issuer = new SessionIssuer(sessions, tokens, refreshTokens);
    refresh = new RefreshSessionUseCase(sessions, tokens, refreshTokens);
    authenticate = new AuthenticateUseCase(tokens, sessions, permissions);
  });

  it('rota el token de refresco y detecta su reutilización cerrando la sesión', async () => {
    const opened = await issuer.open('user-1', 'CUSTOMER');
    const next = await refresh.execute(opened.refreshToken);
    expect(next.refreshToken).not.toBe(opened.refreshToken);

    await expect(refresh.execute(opened.refreshToken)).rejects.toMatchObject({ code: 'REFRESH_REUSED' });
    expect(sessions.sessions.get(opened.sessionId)).toMatchObject({ endReason: 'REFRESH_REUSE_DETECTED' });
    await expect(refresh.execute(next.refreshToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('cerrar sesión revoca el refresco y el token de acceso deja de servir de inmediato', async () => {
    const opened = await issuer.open('user-1', 'CUSTOMER');
    await expect(authenticate.execute(opened.accessToken)).resolves.toMatchObject({ userId: 'user-1', role: 'CUSTOMER' });

    await new SignOutUseCase(sessions, refreshTokens).execute({ refreshToken: opened.refreshToken });
    await expect(refresh.execute(opened.refreshToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(authenticate.execute(opened.accessToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('una cuenta desactivada no puede refrescar', async () => {
    const opened = await issuer.open('user-1', 'COURIER');
    sessions.canSignIn = false;
    await expect(refresh.execute(opened.refreshToken)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(sessions.sessions.get(opened.sessionId)).toMatchObject({ endReason: 'ACCOUNT_DISABLED' });
  });

  describe('modo cliente del domiciliario', () => {
    const setup = async (activeRole: 'COURIER' | 'CUSTOMER') => {
      const courier = accounts.add({
        passwordHash: 'hashed:Domicilio2026',
        roles: [
          { code: 'COURIER', municipalityId: 1, requiresPassword: true },
          { code: 'CUSTOMER', municipalityId: null, requiresPassword: false },
        ],
      });
      const opened = await issuer.open(courier.userId, activeRole);
      const principal: Principal = await authenticate.execute(opened.accessToken);
      const useCase = new SwitchRoleUseCase(accounts, sessions, tokens, new FakeHasher(), new InMemoryOtpChallenges(), permissions, new InMemoryLegal());
      return { principal, useCase };
    };

    it('pasa a modo cliente sin pedir contraseña', async () => {
      const { principal, useCase } = await setup('COURIER');
      const result = await useCase.execute({ principal, role: 'CUSTOMER' });
      expect(result.account.activeRole).toBe('CUSTOMER');
      await expect(authenticate.execute(result.accessToken)).resolves.toMatchObject({ role: 'CUSTOMER' });
    });

    it('volver a modo domiciliario exige la contraseña', async () => {
      const { principal, useCase } = await setup('CUSTOMER');
      await expect(useCase.execute({ principal, role: 'COURIER' })).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
      await expect(useCase.execute({ principal, role: 'COURIER', password: 'mala-clave' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(useCase.execute({ principal, role: 'COURIER', password: 'Domicilio2026' })).resolves.toMatchObject({
        account: { activeRole: 'COURIER' },
      });
    });

    it('nadie puede tomar un rol que no tiene', async () => {
      const { principal, useCase } = await setup('CUSTOMER');
      await expect(useCase.execute({ principal, role: 'ADMIN', password: 'x' })).rejects.toMatchObject({ code: 'ROLE_NOT_GRANTED' });
    });
  });
});
