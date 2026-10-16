import {
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
import { RegisterCustomerUseCase } from './register-customer.use-case';
import { RequestSignInCodeUseCase } from './request-sign-in-code.use-case';
import { VerifySignInCodeUseCase } from './verify-sign-in-code.use-case';

describe('Ingreso del cliente con celular y código (H01.1)', () => {
  let accounts: InMemoryAccounts;
  let legal: InMemoryLegal;
  let sessions: InMemorySessions;
  let request: RequestSignInCodeUseCase;
  let verify: VerifySignInCodeUseCase;
  let register: RegisterCustomerUseCase;
  const tokens = new FakeTokens();

  beforeEach(() => {
    accounts = new InMemoryAccounts();
    legal = new InMemoryLegal();
    sessions = new InMemorySessions();
    const otp = new OtpService(new InMemoryOtpChallenges(), new FakeOtpProvider(), new FakeSettings());
    const finisher = new SignInFinisher(new SessionIssuer(sessions, tokens, new FakeRefreshTokens()), legal, new FakePermissions());
    request = new RequestSignInCodeUseCase(otp);
    verify = new VerifySignInCodeUseCase(otp, accounts, legal, tokens, finisher);
    register = new RegisterCustomerUseCase(tokens, accounts, legal, finisher);
  });

  const codeFor = async (phone: string) => (await request.execute({ phone, channel: 'SMS', language: 'es' })).challengeId;

  it('un número nuevo debe registrarse aceptando la política de datos', async () => {
    const challengeId = await codeFor('3101112233');
    const result = await verify.execute({ challengeId, code: '123456' });
    expect(result.status).toBe('REGISTRATION_REQUIRED');
    if (result.status !== 'REGISTRATION_REQUIRED') return;

    await expect(
      register.execute({ registrationToken: result.registrationToken, givenNames: 'Ana', acceptedLegalVersionIds: [], language: 'es' }),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    const signedIn = await register.execute({
      registrationToken: result.registrationToken,
      givenNames: '  Ana ',
      acceptedLegalVersionIds: result.requiredConsents.map((c) => c.id),
      language: 'es',
    });
    expect(signedIn.account).toMatchObject({ givenNames: 'Ana', activeRole: 'CUSTOMER', phone: '+573101112233' });
    expect(signedIn.session.refreshToken).toBeTruthy();
  });

  it('un cliente existente entra directo como CUSTOMER', async () => {
    accounts.add({ phone: PhoneNumber.parse('3101112233') });
    const result = await verify.execute({ challengeId: await codeFor('3101112233'), code: '123456' });
    expect(result).toMatchObject({ status: 'SIGNED_IN', account: { activeRole: 'CUSTOMER' } });
  });

  it('un domiciliario que entra solo con código queda en modo cliente', async () => {
    accounts.add({
      phone: PhoneNumber.parse('3101112233'),
      roles: [{ code: 'COURIER', municipalityId: 1, requiresPassword: true }],
      passwordHash: 'hashed:x',
    });
    const result = await verify.execute({ challengeId: await codeFor('3101112233'), code: '123456' });
    expect(result).toMatchObject({ status: 'SIGNED_IN', account: { activeRole: 'CUSTOMER', roles: ['COURIER', 'CUSTOMER'] } });
  });

  it('una cuenta desactivada no puede entrar', async () => {
    accounts.add({ phone: PhoneNumber.parse('3101112233'), status: 'DEACTIVATED', canSignIn: false });
    await expect(verify.execute({ challengeId: await codeFor('3101112233'), code: '123456' })).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });
});
