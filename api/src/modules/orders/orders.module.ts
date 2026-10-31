import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { BusinessConfigModule } from '../business-config/business-config.module';
import { FilesModule } from '../files/files.module';
import { ManageAddressesUseCase, ManageRecipientsUseCase } from './application/address-book.use-cases';
import { CheckoutBuilder, CreateOrderUseCase, QuoteOrderUseCase } from './application/checkout.use-cases';
import { ListPaymentMethodsUseCase, ManagePaymentOptionsUseCase } from './application/payment-options.use-cases';
import { GetMyOrderUseCase, ListMyOrdersUseCase } from './application/my-orders.use-cases';
import { REQUIRED_ORDER_CODES } from './domain/orders.codes';
import { AddressBook, RecipientBook } from './domain/ports/address-book';
import { CheckoutReader } from './domain/ports/checkout.reader';
import { OrdersRepository } from './domain/ports/orders.repository';
import { PaymentOptionsRepository } from './domain/ports/payment-options';
import { PrismaAddressBook, PrismaRecipientBook } from './infrastructure/prisma-address-book';
import { PrismaCheckoutReader } from './infrastructure/prisma-checkout.reader';
import { PrismaOrdersRepository } from './infrastructure/prisma-orders.repository';
import { PrismaPaymentOptions } from './infrastructure/prisma-payment-options';
import { AdminPaymentMethodsController, CustomerBookController, OrdersController } from './presentation/http/orders.controller';
import { OrdersPresenter } from './presentation/http/orders-presenter';

/** Al arrancar, verifica los códigos de catálogo y que exista el estado inicial del pedido. */
@Injectable()
class OrderCodesCheck implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_ORDER_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((r) => r.code));
      missing.push(...codes.filter((c) => !found.has(c)).map((c) => `${table}.${c}`));
    }
    // Cada modo activo nace en un estado inicial vigente y tiene su máquina de estados (E15).
    const broken = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT m.code FROM fulfillment_modes m JOIN order_statuses s ON s.id = m.initial_status_id
      WHERE m.deactivated_at IS NULL
        AND (NOT s.is_initial OR s.deactivated_at IS NOT NULL
             OR NOT EXISTS (SELECT 1 FROM order_status_transition_modes tm WHERE tm.fulfillment_mode_id = m.id))`;
    missing.push(...broken.map((b) => `fulfillment_modes.${b.code} (estado inicial y transiciones)`));
    if (missing.length) throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    new Logger('OrdersModule').log('Catálogos de pedidos verificados');
  }
}

/**
 * Módulo `orders` (Docs/14-base-de-datos/E04): direcciones, destinatarios, cotización, confirmación y Mis
 * pedidos. Usa de business-config la tarifa de la zona (QuoteDeliveryUseCase) y la regla de horario.
 */
@Module({
  imports: [BusinessConfigModule, FilesModule],
  controllers: [OrdersController, CustomerBookController, AdminPaymentMethodsController],
  providers: [
    { provide: CheckoutReader, useClass: PrismaCheckoutReader },
    { provide: OrdersRepository, useClass: PrismaOrdersRepository },
    { provide: AddressBook, useClass: PrismaAddressBook },
    { provide: RecipientBook, useClass: PrismaRecipientBook },
    { provide: PaymentOptionsRepository, useClass: PrismaPaymentOptions },
    OrderCodesCheck,
    OrdersPresenter,
    CheckoutBuilder,
    QuoteOrderUseCase,
    CreateOrderUseCase,
    ListPaymentMethodsUseCase,
    ManagePaymentOptionsUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    ManageAddressesUseCase,
    ManageRecipientsUseCase,
  ],
})
export class OrdersModule {}
