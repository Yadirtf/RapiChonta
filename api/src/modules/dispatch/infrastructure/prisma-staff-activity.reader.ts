import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { StaffActivityEntry, StaffActivityQuery, StaffActivityReader } from '../domain/ports/staff-activity';

@Injectable()
export class PrismaStaffActivityReader extends StaffActivityReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(query: StaffActivityQuery): Promise<StaffActivityEntry[]> {
    const filters: Prisma.Sql[] = [Prisma.sql`a.actor_user_id IS NOT NULL`];
    // Con alcance: solo lo de pedidos de su municipio (lo demás no es de un municipio en particular).
    if (query.municipalityId !== null) filters.push(Prisma.sql`a.municipality_id = ${query.municipalityId}`);
    if (query.from) filters.push(Prisma.sql`a.occurred_at >= ${query.from}`);
    if (query.to) filters.push(Prisma.sql`a.occurred_at < ${query.to}`);
    if (query.actorUserId) filters.push(Prisma.sql`a.actor_user_id = ${query.actorUserId}::uuid`);
    if (query.orderCode) filters.push(Prisma.sql`o.code = ${query.orderCode}`);
    if (query.before) filters.push(Prisma.sql`(a.occurred_at, a.id) < (${query.before.occurredAt}, ${query.before.id})`);

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        occurred_at: Date;
        actor_user_id: string;
        given_names: string;
        family_names: string | null;
        role: string | null;
        action: string;
        entity_table: string;
        entity_id: string;
        order_code: string | null;
        details: Record<string, unknown> | null;
      }[]
    >`
      SELECT a.id, a.occurred_at, a.actor_user_id, p.given_names, p.family_names,
             (SELECT r.role_code FROM v_active_user_roles r JOIN roles ro ON ro.id = r.role_id AND ro.is_staff
              WHERE r.user_id = a.actor_user_id ORDER BY ro.sort_order DESC LIMIT 1) AS role,
             a.action, a.entity_table, a.entity_id, o.code AS order_code, a.details
      FROM v_staff_activity a
      JOIN users u ON u.id = a.actor_user_id
      JOIN people p ON p.id = u.person_id
      LEFT JOIN orders o ON o.id = a.order_id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT ${query.limit}`;
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      actor: { userId: r.actor_user_id, givenNames: r.given_names, familyNames: r.family_names, role: r.role },
      action: r.action,
      entityTable: r.entity_table,
      entityId: r.entity_id,
      orderCode: r.order_code,
      details: r.details,
    }));
  }

  async actors(municipalityId: number | null) {
    // El personal (con un rol de personal, vigente o no): pocos, y se listan aunque aún no tengan acciones.
    const scope = municipalityId === null ? Prisma.empty : Prisma.sql`AND (ur.municipality_id = ${municipalityId} OR ur.municipality_id IS NULL)`;
    const rows = await this.prisma.$queryRaw<{ user_id: string; given_names: string; family_names: string | null }[]>`
      SELECT DISTINCT u.id AS user_id, p.given_names, p.family_names
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.is_staff
      JOIN users u ON u.id = ur.user_id JOIN people p ON p.id = u.person_id
      WHERE true ${scope}
      ORDER BY p.given_names, p.family_names`;
    return rows.map((r) => ({ userId: r.user_id, givenNames: r.given_names, familyNames: r.family_names }));
  }
}
