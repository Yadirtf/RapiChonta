import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { DisplayCurrencyCode } from '../domain/business-config.codes';
import { ExchangeRate, ExchangeRatesRepository } from '../domain/ports/exchange-rates';

@Injectable()
export class PrismaExchangeRatesRepository extends ExchangeRatesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ExchangeRate[]> {
    const rows = await this.prisma.$queryRaw<{ code: DisplayCurrencyCode; cop_per_unit: string; source: string; fetched_at: Date }[]>`
      SELECT c.code, r.cop_per_unit::text, r.source, r.fetched_at
      FROM v_current_exchange_rates r JOIN currencies c ON c.id = r.currency_id AND c.deactivated_at IS NULL
      ORDER BY c.sort_order`;
    return rows.map((r) => ({ currency: r.code, copPerUnit: r.cop_per_unit, source: r.source, fetchedAt: r.fetched_at }));
  }

  async save(rates: ExchangeRate[]): Promise<void> {
    await this.prisma.$transaction(
      rates.map(
        (r) => this.prisma.$executeRaw`
          INSERT INTO exchange_rates (currency_id, cop_per_unit, source, fetched_at)
          SELECT id, round(${r.copPerUnit}::numeric, 4), ${r.source.slice(0, 60)}, ${r.fetchedAt} FROM currencies WHERE code = ${r.currency}
          ON CONFLICT (currency_id, fetched_at) DO NOTHING`,
      ),
    );
  }
}
