import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUSH_PROVIDERS, PushProviderCode } from '../../domain/notifications.codes';
import { PushGateway, PushGateways } from '../../domain/ports/push-gateway';
import { FakePushGateway } from './fake-push.gateway';
import { FcmPushGateway } from './fcm-push.gateway';
import { parseServiceAccount } from './google-access-token';
import { HmsPushGateway } from './hms-push.gateway';

export class ConfiguredPushGateways extends PushGateways {
  private readonly byProvider: Map<PushProviderCode, PushGateway>;

  constructor(gateways: PushGateway[]) {
    super();
    this.byProvider = new Map(gateways.map((g) => [g.provider, g]));
  }

  for(provider: PushProviderCode): PushGateway | undefined {
    return this.byProvider.get(provider);
  }
}

/** Activa cada proveedor solo si tiene credenciales. Sin ninguno, los avisos quedan en la bandeja de la app. */
export function pushGatewaysFactory(config: ConfigService): PushGateways {
  const logger = new Logger('NotificationsModule');
  if (config.get<string>('PUSH_PROVIDERS_MODE') === 'fake') {
    logger.warn('PUSH_PROVIDERS_MODE=fake: los avisos no salen del servidor. Solo para pruebas.');
    return new ConfiguredPushGateways([new FakePushGateway(PUSH_PROVIDERS.FCM), new FakePushGateway(PUSH_PROVIDERS.HMS)]);
  }
  const gateways: PushGateway[] = [];
  const serviceAccount = config.get<string>('FCM_SERVICE_ACCOUNT');
  if (serviceAccount) gateways.push(new FcmPushGateway(parseServiceAccount(serviceAccount)));

  const appId = config.get<string>('HMS_APP_ID');
  const clientSecret = config.get<string>('HMS_CLIENT_SECRET');
  if (appId && clientSecret) {
    gateways.push(
      new HmsPushGateway({
        appId,
        clientId: config.get<string>('HMS_CLIENT_ID') || appId,
        clientSecret,
        clickActivity: config.get<string>('HMS_CLICK_ACTIVITY') || 'com.rapichonta.rapichonta/.MainActivity',
        category: config.get<string>('HMS_MESSAGE_CATEGORY') || undefined,
      }),
    );
  }
  const active = gateways.map((g) => g.provider);
  logger.log(active.length ? `Push activo: ${active.join(', ')}` : 'Push sin proveedores configurados: los avisos quedan en la bandeja de la app');
  return new ConfiguredPushGateways(gateways);
}
