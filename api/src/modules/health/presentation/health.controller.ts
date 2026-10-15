import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

/** GET /api/health (sin versión: lo usa Render para saber si el servicio está vivo). */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'rapichonta-api', timestamp: new Date().toISOString() };
  }
}
