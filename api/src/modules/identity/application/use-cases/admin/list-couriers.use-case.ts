import { Injectable } from '@nestjs/common';
import { CourierVerificationCode } from '../../../domain/identity.codes';
import { IdentityErrors } from '../../../domain/identity.errors';
import { CourierDetail, CourierRepository, CourierSummary } from '../../../domain/ports/courier.repository';

@Injectable()
export class ListCouriersUseCase {
  constructor(private readonly couriers: CourierRepository) {}

  execute(filter: { verificationStatus?: CourierVerificationCode; search?: string }): Promise<CourierSummary[]> {
    return this.couriers.list({ ...filter, search: filter.search?.trim() || undefined });
  }
}

@Injectable()
export class GetCourierUseCase {
  constructor(private readonly couriers: CourierRepository) {}

  async execute(userId: string): Promise<CourierDetail> {
    const courier = await this.couriers.findById(userId);
    if (!courier) throw IdentityErrors.courierNotFound();
    return courier;
  }
}
