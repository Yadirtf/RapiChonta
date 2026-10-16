import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { ROLE_CODES, ROLES, RoleCode } from '../../domain/identity.codes';
import { LegalRepository } from '../../domain/ports/legal.repository';
import { Public } from './decorators/auth.decorators';

class LegalQueryDto {
  @IsOptional()
  @IsIn(ROLE_CODES)
  role: RoleCode = ROLES.CUSTOMER;
}

/** Versiones vigentes de los documentos legales que exige un rol (RF-07). */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalRepository) {}

  @Public()
  @Get('current')
  current(@Query() query: LegalQueryDto) {
    return this.legal.currentRequiredFor([query.role]);
  }
}
