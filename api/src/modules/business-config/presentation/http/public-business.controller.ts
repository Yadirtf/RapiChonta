import { Controller, Get, Header, Query } from '@nestjs/common';
import { Public } from '../../../../shared/presentation/public.decorator';
import { PublicCoverageUseCase } from '../../application/coverage.use-cases';
import { ExchangeRatesUseCase } from '../../application/exchange-rates.use-cases';
import { GetBusinessStatusUseCase } from '../../application/schedule.use-cases';
import { QuoteDeliveryUseCase } from '../../application/zones.use-cases';
import { BusinessPresenter as P } from './business-presenter';
import { MunicipalityQueryDto, PointQueryDto, QuoteQueryDto } from './business.dto';

/** Lo que ve el cliente sin iniciar sesión: si se puede pedir ahora, la tarifa a su punto y el aproximado en USD/EUR. */
@Public()
@Controller()
export class PublicBusinessController {
  constructor(
    private readonly status: GetBusinessStatusUseCase,
    private readonly quote: QuoteDeliveryUseCase,
    private readonly rates: ExchangeRatesUseCase,
    private readonly coverage: PublicCoverageUseCase,
  ) {}

  /** GET /api/v1/business/status — abierto ahora, cuándo cierra o cuándo abre (RF-15). */
  @Get('business/status')
  @Header('Cache-Control', 'no-store')
  async businessStatus(@Query() query: MunicipalityQueryDto) {
    const { municipality, state } = await this.status.execute(query.municipalityId);
    return { municipality: P.municipality(municipality), ...P.state(state) };
  }

  /** GET /api/v1/delivery/quote?establishmentId=..&lat=..&lng=.. — tarifa de la zona o NO_COVERAGE (H03.1). */
  @Get('delivery/quote')
  async deliveryQuote(@Query() query: QuoteQueryDto) {
    const quote = await this.quote.execute({ establishmentId: query.establishmentId, latitude: query.lat, longitude: query.lng });
    return { fee: quote.fee, zone: { name: quote.zone.name, kind: quote.zone.kind } };
  }

  /** GET /api/v1/delivery/coverage — hasta dónde llegan los domiciliarios en cada municipio abierto (H03.5). */
  @Get('delivery/coverage')
  @Header('Cache-Control', 'public, max-age=300')
  async coverageMap(@Query() query: MunicipalityQueryDto) {
    return { municipalities: await this.coverage.map(query.municipalityId) };
  }

  /** GET /api/v1/delivery/coverage/check?lat=..&lng=.. — si el punto (GPS o pin) está dentro, y si no, a cuántos metros. */
  @Get('delivery/coverage/check')
  async coverageCheck(@Query() query: PointQueryDto) {
    return this.coverage.check({ latitude: query.lat, longitude: query.lng });
  }

  /** GET /api/v1/business/exchange-rates — tasas para el aproximado (H03.4); nunca se usan para cobrar. */
  @Get('business/exchange-rates')
  @Header('Cache-Control', 'public, max-age=600')
  async exchangeRates() {
    return (await this.rates.current()).map(P.rate);
  }
}
