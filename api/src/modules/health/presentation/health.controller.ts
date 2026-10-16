import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../../../shared/presentation/public.decorator';

/** GET /api/health (sin versión: lo usa Render para saber si el servicio está vivo). */
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'rapichonta-api', timestamp: new Date().toISOString() };
  }
}
