import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { OrderCode } from '../../orders/domain/value-objects/order-code';
import { StaffActivityEntry, StaffActivityReader } from '../domain/ports/staff-activity';

const PAGE = { default: 50, max: 100 } as const;

/** Cursor opaco de la página siguiente: hora e id de la última entrada mostrada. */
export const ActivityCursor = {
  encode: (entry: StaffActivityEntry) => Buffer.from(`${entry.occurredAt.toISOString()}|${entry.id}`).toString('base64url'),
  decode(raw?: string): { occurredAt: Date; id: string } | undefined {
    if (!raw) return undefined;
    const [at, id] = Buffer.from(raw, 'base64url').toString().split('|');
    const occurredAt = new Date(at);
    return id && !Number.isNaN(occurredAt.getTime()) ? { occurredAt, id } : undefined;
  },
};

/**
 * H07.5: registro de auditoría del personal, filtrable por fecha, usuario y pedido. Solo lectura: las tablas
 * de origen no se editan ni se borran (disparadores). El administrador con alcance ve su municipio.
 */
@Injectable()
export class StaffActivityUseCase {
  constructor(private readonly reader: StaffActivityReader) {}

  async list(principal: Principal, query: { from?: Date; to?: Date; actorUserId?: string; orderCode?: string; cursor?: string; limit?: number }) {
    const limit = Math.min(PAGE.max, Math.max(1, Math.trunc(query.limit ?? PAGE.default)));
    const orderCode = query.orderCode ? (OrderCode.normalize(query.orderCode) ?? query.orderCode.trim().toUpperCase()) : undefined;
    const rows = await this.reader.list({
      municipalityId: principal.municipalityId,
      from: query.from,
      to: query.to,
      actorUserId: query.actorUserId,
      orderCode,
      before: ActivityCursor.decode(query.cursor),
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { entries: page, nextCursor: rows.length > limit ? ActivityCursor.encode(page[page.length - 1]) : null };
  }

  actors(principal: Principal) {
    return this.reader.actors(principal.municipalityId);
  }
}
