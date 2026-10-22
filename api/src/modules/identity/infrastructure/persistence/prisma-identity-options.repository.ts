import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { IdentityOptions, IdentityOptionsRepository } from '../../domain/ports/identity-options.repository';

const active = { deactivatedAt: null } as const;
const bySort = { sortOrder: 'asc' } as const;

@Injectable()
export class PrismaIdentityOptionsRepository extends IdentityOptionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<IdentityOptions> {
    const [documentTypes, vehicleTypes, fundingModes, paymentMethods, banks, bankAccountTypes, municipalities] = await Promise.all([
      this.prisma.documentType.findMany({ where: active, orderBy: bySort }),
      this.prisma.vehicleType.findMany({ where: active, orderBy: bySort }),
      this.prisma.fundingMode.findMany({ where: active, orderBy: bySort }),
      this.prisma.paymentMethod.findMany({ where: { ...active, isAccountBased: true, isCashOnDelivery: true }, orderBy: bySort }),
      this.prisma.bank.findMany({ where: active, orderBy: bySort }),
      this.prisma.bankAccountType.findMany({ where: active, orderBy: bySort }),
      this.prisma.municipality.findMany({ select: { id: true, name: true, launchedAt: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      documentTypes: documentTypes.map((d) => d.code),
      vehicleTypes: vehicleTypes.map((v) => ({ code: v.code, requiresPlate: v.requiresPlate })),
      fundingModes: fundingModes.map((f) => f.code),
      paymentMethods: paymentMethods.map((m) => ({ code: m.code, requiresBank: m.requiresBank })),
      banks: banks.map((b) => ({ code: b.code, name: b.name })),
      bankAccountTypes: bankAccountTypes.map((t) => t.code),
      municipalities: municipalities
        .map((m) => ({ id: m.id, name: m.name, launched: m.launchedAt !== null }))
        .sort((a, b) => Number(b.launched) - Number(a.launched)),
    };
  }
}
