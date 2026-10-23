import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { writeAudit } from '../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PAYMENT_METHOD_CHANGED, PAYMENT_METHOD_IMAGE_PURPOSE } from '../domain/orders.codes';
import { PaymentOption, PaymentOptionPatch, PaymentOptionsRepository } from '../domain/ports/payment-options';

type Tx = Prisma.TransactionClient;

interface OptionRow {
  id: number;
  code: string;
  is_account_based: boolean;
  requires_bank: boolean;
  hidden_at: Date | null;
  image_file_id: string | null;
}

const toOption = (r: OptionRow): PaymentOption => ({
  code: r.code,
  isAccountBased: r.is_account_based,
  requiresBank: r.requires_bank,
  offered: r.hidden_at === null,
  imageFileId: r.image_file_id,
});

@Injectable()
export class PrismaPaymentOptions extends PaymentOptionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<PaymentOption[]> {
    return (await this.rows(this.prisma)).map(toOption);
  }

  async reorder(codes: string[], actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = (await this.rows(tx, true)).map((r) => r.code);
      await tx.$executeRaw`
        UPDATE checkout_payment_methods c SET sort_order = x.position
        FROM payment_methods pm, unnest(${codes}::text[]) WITH ORDINALITY AS x(code, position)
        WHERE pm.id = c.payment_method_id AND pm.code = x.code`;
      if (before.join() !== codes.join()) {
        await writeAudit(tx, { actorUserId, action: PAYMENT_METHOD_CHANGED, entityTable: 'checkout_payment_methods', entityId: 'order', changes: { order: { from: before, to: codes } } });
      }
    });
  }

  async update(code: string, patch: PaymentOptionPatch, actorUserId: string): Promise<'updated' | 'not_found' | 'last_offered'> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await this.rows(tx, true);
      const row = rows.find((r) => r.code === code);
      if (!row) return 'not_found';
      const wasOffered = row.hidden_at === null;
      const offered = patch.offered ?? wasOffered;
      if (!offered && wasOffered && !rows.some((r) => r.code !== code && r.hidden_at === null)) return 'last_offered';
      const image = patch.imageFileId === undefined ? row.image_file_id : patch.imageFileId;

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (offered !== wasOffered) changes.offered = { from: wasOffered, to: offered };
      if (image !== row.image_file_id) changes.image = { from: row.image_file_id, to: image };
      if (!Object.keys(changes).length) return 'updated';

      await tx.$executeRaw`
        UPDATE checkout_payment_methods
        SET hidden_at = CASE WHEN ${offered} THEN NULL ELSE coalesce(hidden_at, now()) END, image_file_id = ${image}::uuid
        WHERE payment_method_id = ${row.id}::smallint`;
      await writeAudit(tx, { actorUserId, action: PAYMENT_METHOD_CHANGED, entityTable: 'checkout_payment_methods', entityId: String(row.id), changes: { code, ...changes } });
      return 'updated';
    });
  }

  async isPaymentImage(fileId: string): Promise<boolean> {
    return (await this.prisma.file.count({ where: { id: fileId, purpose: { code: PAYMENT_METHOD_IMAGE_PURPOSE } } })) > 0;
  }

  /** Con `lock`, bloquea las filas hasta el fin de la transacción. */
  private rows(db: Tx | PrismaService, lock = false): Promise<OptionRow[]> {
    return db.$queryRaw<OptionRow[]>`
      SELECT pm.id, pm.code, pm.is_account_based, pm.requires_bank, c.hidden_at, c.image_file_id
      FROM checkout_payment_methods c JOIN payment_methods pm ON pm.id = c.payment_method_id
      WHERE pm.deactivated_at IS NULL AND pm.is_cash_on_delivery
      ORDER BY c.sort_order, pm.id
      ${lock ? Prisma.sql`FOR UPDATE OF c` : Prisma.empty}`;
  }
}
