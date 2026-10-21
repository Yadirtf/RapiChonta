import { PushProviderCode } from '../notifications.codes';
import { PushMessage, PushOutcome } from '../push-message';

/** Puerto hacia un proveedor push (FCM, Huawei Push Kit o el falso de las pruebas). */
export abstract class PushGateway {
  abstract readonly provider: PushProviderCode;
  /** Envía el mismo mensaje a varios tokens del proveedor; devuelve un resultado por token, en el mismo orden. */
  abstract send(message: PushMessage, tokens: string[]): Promise<PushOutcome[]>;
}

/** Los proveedores configurados en este entorno. Sin credenciales de uno, sus tokens no se intentan. */
export abstract class PushGateways {
  abstract for(provider: PushProviderCode): PushGateway | undefined;
}
