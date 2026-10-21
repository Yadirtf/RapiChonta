import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '../../../identity/domain/identity.codes';
import { Principal } from '../../../identity/domain/principal';
import { CurrentPrincipal, RequirePermissions } from '../../../identity/presentation/http/decorators/auth.decorators';
import { MyNotificationsUseCase } from '../../application/inbox.use-cases';
import { RegisterPushTokenUseCase, RemovePushTokenUseCase } from '../../application/push-tokens.use-cases';
import { InboxItem } from '../../domain/ports/inbox.repository';
import { MarkReadDto, MyNotificationsQueryDto, RegisterPushTokenDto } from './notifications.dto';

const item = (n: InboxItem) => ({
  id: n.id,
  type: n.type,
  orderCode: n.orderCode,
  status: n.status,
  storeName: n.storeName,
  params: n.params,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt?.toISOString() ?? null,
});

/** E06: token push del dispositivo y bandeja de avisos. Cada usuario opera solo sobre lo suyo (id de la sesión). */
@Controller('me')
@RequirePermissions(PERMISSIONS.ACCOUNT_MANAGE_OWN)
export class NotificationsController {
  constructor(
    private readonly registerToken: RegisterPushTokenUseCase,
    private readonly removeToken: RemovePushTokenUseCase,
    private readonly notifications: MyNotificationsUseCase,
  ) {}

  /** PUT /api/v1/me/push-token — al iniciar sesión y cada vez que el proveedor rota el token (H06.1). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Put('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: RegisterPushTokenDto) {
    await this.registerToken.execute(principal, body);
  }

  /** DELETE /api/v1/me/push-token — antes de cerrar sesión: el teléfono deja de recibir avisos. */
  @Delete('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentPrincipal() principal: Principal) {
    await this.removeToken.execute(principal);
  }

  /** GET /api/v1/me/notifications?before=..&limit=.. — avisos recientes primero y cuántos faltan por leer. */
  @Get('notifications')
  @Header('Cache-Control', 'no-store')
  async list(@CurrentPrincipal() principal: Principal, @Query() query: MyNotificationsQueryDto) {
    const page = await this.notifications.list(principal, { before: query.before ? new Date(query.before) : undefined, limit: query.limit });
    return { items: page.items.map(item), unread: page.unread, nextBefore: page.nextBefore };
  }

  /** GET /api/v1/me/notifications/unread — solo el contador (la campana de la app). */
  @Get('notifications/unread')
  @Header('Cache-Control', 'no-store')
  async unread(@CurrentPrincipal() principal: Principal) {
    return { unread: await this.notifications.unread(principal) };
  }

  /** POST /api/v1/me/notifications/read — marca leídos los indicados (o todos). */
  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  async read(@CurrentPrincipal() principal: Principal, @Body() body: MarkReadDto) {
    return { unread: await this.notifications.markRead(principal, body.ids) };
  }
}
