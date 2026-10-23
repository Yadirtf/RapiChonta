import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ContentLanguage } from '../../catalog/domain/catalog.codes';
import { CustomerExposure, MenuVersion } from '../domain/checkout';
import { NEW_CUSTOMER_LIMIT_SETTING } from '../domain/orders.codes';
import { CheckoutReader, OrderingEstablishment } from '../domain/ports/checkout.reader';
import { Money } from '../domain/value-objects/money';

interface VersionRow {
  version_id: string;
  product_id: string;
  establishment_id: string;
  orderable: boolean;
  current_id: string;
  price: string;
  prep_minutes: number;
  name: string;
}

@Injectable()
export class PrismaCheckoutReader extends CheckoutReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async establishment(id: string): Promise<OrderingEstablishment | null> {
    const [row] = await this.prisma.$queryRaw<{ id: string; name: string; municipality_id: number; accepts_orders: boolean }[]>`
      SELECT e.id, e.name, e.municipality_id,
             s.accepts_orders AND m.launched_at IS NOT NULL AND m.launched_at <= now() AS accepts_orders
      FROM establishments e
      JOIN establishment_statuses s ON s.id = e.status_id
      JOIN municipalities m ON m.id = e.municipality_id
      WHERE e.id = ${id}::uuid`;
    return row ? { id: row.id, name: row.name, municipalityId: Number(row.municipality_id), acceptsOrders: row.accepts_orders } : null;
  }

  async menuVersions(versionIds: string[], language: ContentLanguage): Promise<MenuVersion[]> {
    if (!versionIds.length) return [];
    // El producto se puede pedir si su estado lo permite y su sección del menú sigue activa (igual que v_menu).
    const rows = await this.prisma.$queryRaw<VersionRow[]>`
      SELECT v.id AS version_id, v.product_id, p.establishment_id,
             ps.is_orderable AND ms.deactivated_at IS NULL AS orderable,
             cv.id AS current_id, cv.price::text AS price, cv.prep_minutes,
             COALESCE(tl.name, te.name) AS name
      FROM product_versions v
      JOIN products p ON p.id = v.product_id
      JOIN product_statuses ps ON ps.id = p.status_id
      JOIN menu_sections ms ON ms.id = p.menu_section_id
      JOIN v_current_product_versions cv ON cv.product_id = p.id
      JOIN languages les ON les.code = 'es'
      LEFT JOIN languages ll ON ll.code = ${language}
      JOIN product_version_texts te ON te.product_version_id = cv.id AND te.language_id = les.id
      LEFT JOIN product_version_texts tl ON tl.product_version_id = cv.id AND tl.language_id = ll.id
      WHERE v.id = ANY(${versionIds}::uuid[])`;
    return rows.map((r) => ({
      versionId: r.version_id,
      productId: r.product_id,
      establishmentId: r.establishment_id,
      orderable: r.orderable,
      current: { versionId: r.current_id, name: r.name, price: r.price, prepMinutes: r.prep_minutes },
    }));
  }

  async exposure(customerUserId: string): Promise<CustomerExposure> {
    const [row] = await this.prisma.$queryRaw<{ delivered: bigint; active_items: string }[]>`
      SELECT coalesce((SELECT d.delivered FROM v_customer_delivered_counts d WHERE d.customer_user_id = ${customerUserId}::uuid), 0) AS delivered,
             coalesce((SELECT sum(a.items_total) FROM orders o
                       JOIN order_statuses s ON s.id = o.status_id AND NOT s.is_terminal
                       JOIN v_order_amounts a ON a.order_id = o.id
                       WHERE o.customer_user_id = ${customerUserId}::uuid), 0)::numeric(12,2)::text AS active_items`;
    return { deliveredOrders: Number(row.delivered), activeItemsCents: Money.toCents(row.active_items) };
  }

  async newCustomerLimit(municipalityId: number): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
      SELECT value::numeric(12,2)::text AS value FROM v_current_settings WHERE key = ${NEW_CUSTOMER_LIMIT_SETTING} AND municipality_id = ${municipalityId}`;
    return row?.value ?? null;
  }

  async commissionRateId(municipalityId: number): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM v_current_commission_rates WHERE municipality_id = ${municipalityId}`;
    return row?.id ?? null;
  }

  async paymentMethods(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT pm.code FROM checkout_payment_methods c JOIN payment_methods pm ON pm.id = c.payment_method_id
      WHERE c.hidden_at IS NULL AND pm.deactivated_at IS NULL AND pm.is_cash_on_delivery
      ORDER BY c.sort_order, pm.id`;
    return rows.map((r) => r.code);
  }
}
