import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import en from '../../i18n/en.json';
import es from '../../i18n/es.json';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { MyNotificationsUseCase } from './application/inbox.use-cases';
import { DEFAULT_DISPATCH_OPTIONS, NotificationDispatcher } from './application/notification-dispatcher';
import { Notifier, OutboxSignal } from './application/notifier';
import { RegisterPushTokenUseCase, RemovePushTokenUseCase } from './application/push-tokens.use-cases';
import { PushTexts } from './domain/compose-push';
import { REQUIRED_NOTIFICATION_CODES } from './domain/notifications.codes';
import { InboxRepository } from './domain/ports/inbox.repository';
import { NotificationOutbox } from './domain/ports/notification-outbox';
import { PushGateways } from './domain/ports/push-gateway';
import { PushTokenRepository } from './domain/ports/push-token.repository';
import { OutboxPump } from './infrastructure/outbox-pump';
import { PrismaInboxRepository } from './infrastructure/persistence/prisma-inbox.repository';
import { PrismaNotificationOutbox } from './infrastructure/persistence/prisma-notification-outbox';
import { PrismaPushTokenRepository } from './infrastructure/persistence/prisma-push-token.repository';
import { pushGatewaysFactory } from './infrastructure/push/push-gateways';
import { NotificationsController } from './presentation/http/notifications.controller';

/** Plantillas de los avisos por idioma (api/src/i18n). */
export const PUSH_TEXTS: PushTexts = { es, en };

/** Al arrancar, verifica los códigos de catálogo que usa el módulo. */
@Injectable()
class NotificationCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_NOTIFICATION_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('NotificationsModule').log('Catálogos de notificaciones verificados');
  }
}

const seconds = (config: ConfigService, key: string, fallback: number) => {
  const value = Number(config.get<string>(key));
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 1000;
};

/**
 * Módulo `notifications` (Docs/14-base-de-datos/E06): tokens push por dispositivo, bandeja de salida y su
 * reparto por FCM o Huawei Push Kit, y la bandeja de avisos de la app. Los demás módulos usan `Notifier`.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: PushTokenRepository, useClass: PrismaPushTokenRepository },
    { provide: NotificationOutbox, useClass: PrismaNotificationOutbox },
    { provide: InboxRepository, useClass: PrismaInboxRepository },
    { provide: PushGateways, inject: [ConfigService], useFactory: pushGatewaysFactory },
    {
      provide: NotificationDispatcher,
      inject: [NotificationOutbox, PushGateways],
      useFactory: (outbox: NotificationOutbox, gateways: PushGateways) => new NotificationDispatcher(outbox, gateways, PUSH_TEXTS),
    },
    {
      provide: OutboxPump,
      inject: [NotificationDispatcher, NotificationOutbox, ConfigService],
      useFactory: (dispatcher: NotificationDispatcher, outbox: NotificationOutbox, config: ConfigService) =>
        new OutboxPump(dispatcher, outbox, {
          activeMs: seconds(config, 'NOTIFICATIONS_ACTIVE_SWEEP_SECONDS', 5),
          idleMs: seconds(config, 'NOTIFICATIONS_IDLE_SWEEP_SECONDS', 600),
          batchSize: DEFAULT_DISPATCH_OPTIONS.batchSize,
        }),
    },
    { provide: OutboxSignal, useExisting: OutboxPump },
    NotificationCodesCheck,
    Notifier,
    RegisterPushTokenUseCase,
    RemovePushTokenUseCase,
    MyNotificationsUseCase,
  ],
  exports: [Notifier],
})
export class NotificationsModule {}
