import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RoleCode } from '../../domain/identity.codes';
import { LegalDocumentVersion, LegalRepository } from '../../domain/ports/legal.repository';

interface VersionRow {
  id: string;
  document_type_code: string;
  version_label: string;
  published_at: Date;
}

const toVersion = (row: VersionRow): LegalDocumentVersion => ({
  id: row.id,
  documentType: row.document_type_code,
  versionLabel: row.version_label,
  publishedAt: row.published_at,
});

@Injectable()
export class PrismaLegalRepository extends LegalRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async currentRequiredFor(roles: RoleCode[]): Promise<LegalDocumentVersion[]> {
    if (!roles.length) return [];
    const rows = await this.prisma.$queryRaw<VersionRow[]>`
      SELECT DISTINCT cv.id, cv.document_type_code, cv.version_label, cv.published_at, t.sort_order
      FROM v_current_legal_document_versions cv
      JOIN legal_document_types t ON t.id = cv.legal_document_type_id
      JOIN legal_document_requirements req ON req.legal_document_type_id = cv.legal_document_type_id
      JOIN roles r ON r.id = req.role_id
      WHERE r.code IN (${Prisma.join(roles)})
      ORDER BY t.sort_order`;
    return rows.map(toVersion);
  }

  async pendingFor(userId: string): Promise<LegalDocumentVersion[]> {
    const rows = await this.prisma.$queryRaw<VersionRow[]>`
      SELECT p.legal_document_version_id AS id, p.document_type_code, p.version_label, v.published_at
      FROM v_pending_consents p
      JOIN legal_document_versions v ON v.id = p.legal_document_version_id
      JOIN legal_document_types t ON t.id = v.legal_document_type_id
      WHERE p.user_id = ${userId}::uuid
      ORDER BY t.sort_order`;
    return rows.map(toVersion);
  }

  async accept(userId: string, versionIds: string[], ipAddress?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
    await this.prisma.personConsent.createMany({
      data: versionIds.map((legalDocumentVersionId) => ({ personId: user.personId, legalDocumentVersionId, ipAddress: ipAddress ?? null })),
      skipDuplicates: true,
    });
  }
}
