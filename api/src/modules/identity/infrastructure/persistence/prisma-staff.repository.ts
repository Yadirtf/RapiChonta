import { Injectable } from '@nestjs/common';
import { CatalogIds } from '../../../../shared/infrastructure/prisma/catalog-ids';
import { writeAudit } from '../../../../shared/infrastructure/prisma/audit';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { RoleCode, UserStatusCode } from '../../domain/identity.codes';
import { NewStaffMember, StaffMember, StaffRepository } from '../../domain/ports/staff.repository';
import { AccountWriter } from './account-writer';

@Injectable()
export class PrismaStaffRepository extends StaffRepository {
  private readonly writer: AccountWriter;

  constructor(
    private readonly prisma: PrismaService,
    ids: CatalogIds,
  ) {
    super();
    this.writer = new AccountWriter(ids);
  }

  async create(member: NewStaffMember): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      let userId = member.existingUserId;
      if (userId) {
        await this.writer.promoteExistingAccount(tx, userId, member);
      } else {
        ({ userId } = await this.writer.createAccount(tx, {
          ...member,
          phoneVerified: false,
          language: 'es',
          createdByUserId: member.createdByUserId,
        }));
        await writeAudit(tx, { actorUserId: member.createdByUserId, action: 'USER_CREATED', entityTable: 'users', entityId: userId });
      }
      await this.writer.grantRole(tx, {
        userId,
        role: member.role,
        municipalityId: member.municipalityId,
        grantedByUserId: member.createdByUserId,
      });
      await writeAudit(tx, {
        actorUserId: member.createdByUserId,
        action: 'ROLE_GRANTED',
        entityTable: 'users',
        entityId: userId,
        changes: { role: member.role, municipalityId: member.municipalityId },
      });
      return userId;
    });
  }

  async list(): Promise<StaffMember[]> {
    const users = await this.prisma.user.findMany({
      where: { roles: { some: { revokedAt: null, role: { isStaff: true } } } },
      include: {
        person: { include: { phones: { where: { isPrimary: true } } } },
        status: true,
        roles: { where: { revokedAt: null, role: { isStaff: true } }, include: { role: true, municipality: true } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => ({
      userId: user.id,
      givenNames: user.person.givenNames,
      familyNames: user.person.familyNames,
      phone: user.person.phones[0]?.phoneE164 ?? null,
      roles: user.roles.map((ur) => ({ code: ur.role.code as RoleCode, municipality: ur.municipality?.name ?? null })),
      accountStatus: user.status.code as UserStatusCode,
      lastSignInAt: user.sessions[0]?.createdAt ?? null,
      createdAt: user.createdAt,
    }));
  }

  async isUserStatusTransitionAllowed(from: UserStatusCode, to: UserStatusCode): Promise<boolean> {
    const count = await this.prisma.userStatusTransition.count({ where: { fromStatus: { code: from }, toStatus: { code: to } } });
    return count > 0;
  }
}

