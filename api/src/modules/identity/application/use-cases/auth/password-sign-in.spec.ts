import {
  FakeHasher,
  FakeOtpProvider,
  FakePermissions,
  FakeRefreshTokens,
  FakeSettings,
  FakeTokens,
  InMemoryAccounts,
  InMemoryLegal,
  InMemoryOtpChallenges,
  InMemorySessions,
} from '../../../../../../test/identity/fakes';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { OtpService } from '../../services/otp.service';
import { SessionIssuer } from '../../services/session-issuer';
import { SignInFinisher } from '../../services/signed-in';
import { CompletePasswordSignInUseCase } from './complete-password-sign-in.use-case';
import { StartPasswordSignInUseCase } from './start-password-sign-in.use-case';

describe('Ingreso del personal y domiciliarios con contraseña + código (H01.4, H01.3)', () => {
  let accounts: InMemoryAccounts;
  let challenges: InMemoryOtpChallenges;
  let hasher: FakeHasher;
  let start: StartPasswordSignInUseCase;
  let complete: CompletePasswordSignInUseCase;

  beforeEach(() => {
    accounts = new InMemoryAccounts();
    challenges = new InMemoryOtpChallenges();
    hasher = new FakeHasher();
    const otp = new OtpService(challenges, new FakeOtpProvider(), new FakeSettings());
    const finisher = new SignInFinisher(
      new SessionIssuer(new InMemorySessions(), new FakeTokens(), new FakeRefreshTokens()),
      new InMemoryLegal(),
      new FakePermissions(),
    );
    start = new StartPasswordSignInUseCase(accounts, hasher, challenges, otp);
    complete = new CompletePasswordSignInUseCase(otp, accounts, finisher);
    accounts.add({
      phone: PhoneNumber.parse('3001234567'),
      passwordHash: 'hashed:ClaveSegura123',
      roles: [
        { code: 'CUSTOMER', municipalityId: null, requiresPassword: false },
        { code: 'OPERATOR', municipalityId: 1, requiresPassword: true },
      ],
    });
  });

  const attempt = (password: string, phone = '3001234567') =>
    start.execute({ phone, password, channel: 'SMS', language: 'es' });

  it('con la contraseña correcta envía el código y entra con el rol de personal', async () => {
    const { challengeId } = await attempt('ClaveSegura123');
    const result = await complete.execute({ challengeId, code: '123456' });
    expect(result.account).toMatchObject({ activeRole: 'OPERATOR', permissions: expect.arrayContaining(['orders.assign']) });
  });

  it('responde lo mismo si el número no existe o la contraseña es incorrecta', async () => {
    await expect(attempt('otra-clave-1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(attempt('ClaveSegura123', '3119998877')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(hasher.dummyCalls).toBe(1);
  });

  it('un cliente sin rol de personal nunca ve el formulario de contraseña funcionar', async () => {
    accounts.add({ phone: PhoneNumber.parse('3109998877'), passwordHash: null });
    await expect(attempt('cualquier-clave', '3109998877')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('bloquea tras 5 contraseñas incorrectas seguidas', async () => {
    for (let i = 0; i < 5; i++) await expect(attempt('incorrecta-123')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(attempt('ClaveSegura123')).rejects.toMatchObject({ code: 'PASSWORD_LOCKED' });
  });

  it('no deja abrir la sesión con un rol que la persona no tiene', async () => {
    const { challengeId } = await attempt('ClaveSegura123');
    await expect(complete.execute({ challengeId, code: '123456', role: 'ADMIN' })).rejects.toMatchObject({ code: 'ROLE_NOT_GRANTED' });
  });
});
