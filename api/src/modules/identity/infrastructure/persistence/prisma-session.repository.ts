import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RoleCode, SessionEndReasonCode } from '../../domain/identity.codes';
import { ActiveSession, NewSession, SessionRepository, StoredRefreshToken } from '../../domain/ports/session.repository';
import { AccountWriter } from './account-writer';

@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  private readonly writer: AccountWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: CatalogIds,
  ) {
    super();
    this.writer = new AccountWriter(ids);
  }

  async create(session: NewSession): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      let deviceId: string | null = null;
      if (session.device) {
        const platformId = await this.ids.of('platforms', session.device.platform, tx);
        const device = await tx.device.upsert({
          where: { installationId: session.device.installationId },
          create: {
            installationId: session.device.installationId,
            platformId,
            appVersion: session.device.appVersion ?? null,
          },
          update: { lastSeenAt: new Date(), appVersion: session.device.appVersion ?? undefined },
        });
        deviceId = device.id;
      }
      const created = await tx.session.create({
        data: { userId: session.userId, activeRoleId: await this.ids.of('roles', session.role, tx), deviceId },
      });
      await tx.refreshToken.create({
        data: { sessionId: created.id, tokenHash: session.refreshTokenHash, expiresAt: session.refreshExpiresAt },
      });
      return created.id;
    });
  }

  async findRefreshToken(hash: string): Promise<StoredRefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { session: { include: { activeRole: { select: { code: true } } } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.sessionId,
      userId: row.session.userId,
      role: row.session.activeRole.code as RoleCode,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      sessionEndedAt: row.session.endedAt,
    };
  }

  async rotate(input: { tokenId: string; sessionId: string; newHash: string; expiresAt: Date }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: input.tokenId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (count !== 1) return false;
      await tx.refreshToken.create({ data: { sessionId: input.sessionId, tokenHash: input.newHash, expiresAt: input.expiresAt } });
      return true;
    });
  }

  async findActive(sessionId: string): Promise<ActiveSession | null> {
    const [row] = await this.prisma.$queryRaw<
      { user_id: string; role: string; can_sign_in: boolean; granted: boolean; municipality_id: number | null }[]
    >`
      SELECT s.user_id, r.code AS role, us.can_sign_in, (ur.id IS NOT NULL) AS granted, ur.municipality_id
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN user_statuses us ON us.id = u.status_id
      JOIN roles r ON r.id = s.active_role_id
      LEFT JOIN LATERAL (
        SELECT id, municipality_id FROM user_roles
        WHERE user_id = s.user_id AND role_id = s.active_role_id AND revoked_at IS NULL
        ORDER BY granted_at LIMIT 1
      ) ur ON true
      WHERE s.id = ${sessionId}::uuid AND s.ended_at IS NULL`;
    if (!row) return null;
    return {
      sessionId,
      userId: row.user_id,
      role: row.role as RoleCode,
      canSignIn: row.can_sign_in,
      roleStillGranted: row.granted,
      municipalityId: row.municipality_id,
    };
  }

  async setActiveRole(sessionId: string, role: RoleCode): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { activeRoleId: await this.ids.of('roles', role) } });
  }

  async end(sessionId: string, reason: SessionEndReasonCode): Promise<void> {
    await this.prisma.$transaction((tx) => this.writer.endSessions(tx, { sessionId }, reason));
  }

  async endAllForUser(userId: string, reason: SessionEndReasonCode): Promise<void> {
    await this.prisma.$transaction((tx) => this.writer.endSessions(tx, { userId }, reason));
  }

  async endOthers(userId: string, keepSessionId: string, reason: SessionEndReasonCode): Promise<void> {
    await this.prisma.$transaction((tx) => this.writer.endSessions(tx, { userId, exceptSessionId: keepSessionId }, reason));
  }
}
