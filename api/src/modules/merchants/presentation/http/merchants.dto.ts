import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AcceptOrderDto {
  /** Lo que de verdad tarda (el caso de uso valida el rango y la base lo vuelve a exigir). */
  @Type(() => Number)
  @IsInt()
  preparationMinutes: number;
}

export class DeclineOrderDto {
  @IsString()
  @MaxLength(40)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}

export class StoreAvailabilityDto {
  @IsBoolean()
  open: boolean;
}

export class StartPartnershipDto {
  @IsOptional()
  @Matches(DAY)
  startedOn?: string;

  @IsOptional()
  @Matches(DAY)
  endedOn?: string;

  @IsOptional()
  @IsUUID()
  agreementFileId?: string;
}

export class EndPartnershipDto {
  @IsOptional()
  @Matches(DAY)
  endedOn?: string;
}

/** Solo el número si ya atiende otro local; con sus datos y contraseña si es una cuenta nueva. */
export class StoreMemberDto {
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  givenNames?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  familyNames?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9.\s-]{3,20}$/)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
