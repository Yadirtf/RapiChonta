import { Logger } from '@nestjs/common';
import { PushProviderCode } from '../../domain/notifications.codes';
import { PushGateway } from '../../domain/ports/push-gateway';
import { PushMessage, PushOutcome } from '../../domain/push-message';

/**
 * Proveedor falso para pruebas y desarrollo (PUSH_PROVIDERS_MODE=fake): guarda lo enviado y simula respuestas
 * por prefijo del token: `invalid-…` ya no existe, `flaky-…` falla una vez y luego entra, `down-…` siempre falla.
 */
export class FakePushGateway extends PushGateway {
  readonly sent: { message: PushMessage; token: string }[] = [];
  private readonly failedOnce = new Set<string>();
  private readonly logger = new Logger(FakePushGateway.name);

  constructor(readonly provider: PushProviderCode) {
    super();
  }

  async send(message: PushMessage, tokens: string[]): Promise<PushOutcome[]> {
    return tokens.map((token) => {
      if (token.startsWith('invalid-')) return { kind: 'invalidToken', errorCode: 'UNREGISTERED' };
      if (token.startsWith('down-')) return { kind: 'failed', errorCode: 'UNAVAILABLE', retryable: true };
      if (token.startsWith('flaky-') && !this.failedOnce.has(token)) {
        this.failedOnce.add(token);
        return { kind: 'failed', errorCode: 'UNAVAILABLE', retryable: true };
      }
      this.sent.push({ message, token });
      this.logger.log(`[${this.provider}] ${message.title} — ${message.body}`);
      return { kind: 'sent', providerMessageId: `fake-${this.sent.length}` };
    });
  }
}
