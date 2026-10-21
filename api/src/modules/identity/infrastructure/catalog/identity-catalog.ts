import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { REQUIRED_CATALOG_CODES, RoleCode } from '../../domain/identity.codes';
import { RolePermissions } from '../../domain/ports/role-permissions.port';

/**
 * Al arrancar: verifica que existan los códigos de catálogo que usa el programa (falla si falta uno)
 * y carga en memoria los permisos de cada rol (role_permissions) para los guards.
 */
@Injectable()
export class IdentityCatalog extends RolePermissions implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityCatalog.name);
  private permissions = new Map<string, ReadonlySet<string>>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    await this.verifyCatalogs();
    await this.reload();
  }

  permissionsOf(role: RoleCode): ReadonlySet<string> {
    return this.permissions.get(role) ?? new Set();
  }

  async reload(): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ role: string; permission: string }[]>`
      SELECT r.code AS role, p.code AS permission
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id AND r.deactivated_at IS NULL
      JOIN permissions p ON p.id = rp.permission_id AND p.deactivated_at IS NULL`;
    const map = new Map<string, Set<string>>();
    for (const { role, permission } of rows) map.set(role, (map.get(role) ?? new Set()).add(permission));
    this.permissions = map;
  }

  private async verifyCatalogs(): Promise<void> {
    const missing: string[] = [];
    for (const [table, codes] of Object.entries(REQUIRED_CATALOG_CODES)) {
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`
        SELECT code FROM ${Prisma.raw(`"${table}"`)} WHERE code IN (${Prisma.join([...codes])})`;
      const found = new Set(rows.map((row) => row.code));
      missing.push(...codes.filter((code) => !found.has(code)).map((code) => `${table}.${code}`));
    }
    if (missing.length) {
      throw new Error(`Faltan códigos de catálogo (ejecute la semilla): ${missing.join(', ')}`);
    }
    this.logger.log('Catálogos de identidad verificados');
  }
}
