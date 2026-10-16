import { FakeOtpProvider, FakeSettings, InMemoryOtpChallenges } from '../../../../../test/identity/fakes';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { OtpService } from './otp.service';

describe('OtpService (H01.1)', () => {
  const phone = PhoneNumber.parse('3001234567');
  let challenges: InMemoryOtpChallenges;
  let settings: FakeSettings;
  let service: OtpService;

  beforeEach(() => {
    challenges = new InMemoryOtpChallenges();
    settings = new FakeSettings();
    service = new OtpService(challenges, new FakeOtpProvider(), settings);
  });

  const send = () => service.send({ phone, purpose: 'SIGN_IN', channel: 'SMS', language: 'es' });

  it('crea un código que vence a los 5 minutos y no expone el número', async () => {
    const sent = await send();
    expect(sent.maskedPhone).toBe('+57 ••• ••• 4567');
    expect(sent.expiresAt.getTime() - Date.now()).toBeGreaterThan(299_000);
    expect(challenges.challenges.get(sent.challengeId)?.codeHash).toBeTruthy();
  });

  it('no envía más de 3 códigos por hora al mismo número', async () => {
    await send();
    await send();
    await send();
    await expect(send()).rejects.toMatchObject({ code: 'OTP_SEND_LIMIT', retryAfterSeconds: expect.any(Number) });
  });

  it('valida el código una sola vez', async () => {
    const { challengeId } = await send();
    const result = await service.verify({ challengeId, code: '123456', purpose: 'SIGN_IN' });
    expect(result.e164).toBe(phone.e164);
    await expect(service.verify({ challengeId, code: '123456', purpose: 'SIGN_IN' })).rejects.toMatchObject({ code: 'OTP_NOT_FOUND' });
  });

  it('informa los intentos restantes y bloquea al quinto fallo', async () => {
    const { challengeId } = await send();
    for (let remaining = 4; remaining >= 1; remaining--) {
      await expect(service.verify({ challengeId, code: '000000', purpose: 'SIGN_IN' })).rejects.toMatchObject({
        code: 'OTP_INVALID',
        details: { remainingAttempts: remaining },
      });
    }
    await expect(service.verify({ challengeId, code: '000000', purpose: 'SIGN_IN' })).rejects.toMatchObject({ code: 'OTP_LOCKED' });
    // Ni siquiera el código correcto sirve después del bloqueo.
    await expect(service.verify({ challengeId, code: '123456', purpose: 'SIGN_IN' })).rejects.toMatchObject({ code: 'OTP_LOCKED' });
  });

  it('rechaza un código vencido', async () => {
    settings.values.ttlSeconds = -1;
    const { challengeId } = await send();
    await expect(service.verify({ challengeId, code: '123456', purpose: 'SIGN_IN' })).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('no acepta un código emitido para otro propósito', async () => {
    const { challengeId } = await send();
    await expect(service.verify({ challengeId, code: '123456', purpose: 'STAFF_SIGN_IN' })).rejects.toMatchObject({ code: 'OTP_NOT_FOUND' });
  });
});
