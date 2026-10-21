import { MemoryPushTokens } from '../../../../test/notifications/fakes';
import { Principal } from '../../identity/domain/principal';
import { RegisterPushTokenUseCase, RemovePushTokenUseCase } from './push-tokens.use-cases';

const principal = (sessionId: string): Principal => ({ userId: 'u-1', sessionId, role: 'CUSTOMER', permissions: new Set(), municipalityId: null });

describe('Token push del dispositivo (H06.1)', () => {
  it('se registra en el dispositivo de la sesión y reemplaza el anterior del mismo proveedor', async () => {
    const tokens = new MemoryPushTokens();
    tokens.devices.set('s-app', 'dev-1');
    const register = new RegisterPushTokenUseCase(tokens);
    await register.execute(principal('s-app'), { provider: 'HMS', token: ' token-viejo-0000000 ' });
    await register.execute(principal('s-app'), { provider: 'HMS', token: 'token-nuevo-0000000' });
    expect(tokens.tokens).toEqual([
      { deviceId: 'dev-1', provider: 'HMS', token: 'token-viejo-0000000', invalidated: 'REPLACED' },
      { deviceId: 'dev-1', provider: 'HMS', token: 'token-nuevo-0000000' },
    ]);
  });

  it('una sesión sin dispositivo (la web) no puede registrar tokens', async () => {
    await expect(new RegisterPushTokenUseCase(new MemoryPushTokens()).execute(principal('s-web'), { provider: 'FCM', token: 'x'.repeat(20) })).rejects.toMatchObject({
      code: 'PUSH_DEVICE_REQUIRED',
    });
  });

  it('al cerrar sesión se dan de baja los tokens del dispositivo', async () => {
    const tokens = new MemoryPushTokens();
    tokens.devices.set('s-app', 'dev-1');
    await new RegisterPushTokenUseCase(tokens).execute(principal('s-app'), { provider: 'FCM', token: 'fcm-0000000000000' });
    await new RemovePushTokenUseCase(tokens).execute(principal('s-app'));
    expect(tokens.tokens[0].invalidated).toBe('SIGNED_OUT');
  });
});
