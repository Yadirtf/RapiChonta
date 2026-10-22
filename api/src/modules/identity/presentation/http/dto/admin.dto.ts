import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { COURIER_VERIFICATION, CourierVerificationCode, ROLES, RoleCode, USER_STATUSES, UserStatusCode } from '../../../domain/identity.codes';

export class PersonDto {
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  givenNames: string;

  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  familyNames: string;

  @IsString()
  @MaxLength(40)
  documentType: string;

  @IsString()
  @Matches(/^[A-Za-z0-9.\s-]{3,20}$/)
  documentNumber: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class VehicleDto {
  @IsString()
  @MaxLength(40)
  type: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\s-]{3,10}$/)
  plate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;
}

export class CollectionAccountDto {
  @IsString()
  @MaxLength(40)
  paymentMethod: string;

  @IsString()
  @Matches(/^[0-9\s-]{6,30}$/)
  accountNumber: string;

  @IsString()
  @Length(3, 120)
  holderName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountType?: string;
}

export class CreateCourierDto extends PersonDto {
  @Type(() => Number)
  @IsInt()
  municipalityId: number;

  @IsString()
  @MaxLength(40)
  fundingMode: string;

  @ValidateNested()
  @Type(() => VehicleDto)
  vehicle: VehicleDto;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CollectionAccountDto)
  collectionAccounts: CollectionAccountDto[];
}

export class ListCouriersQueryDto {
  @IsOptional()
  @IsIn(Object.values(COURIER_VERIFICATION))
  status?: CourierVerificationCode;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class ChangeCourierMunicipalityDto {
  @IsInt()
  @Min(1)
  municipalityId: number;
}

export class ChangeVerificationDto {
  @IsIn(Object.values(COURIER_VERIFICATION))
  status: CourierVerificationCode;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ChangeUserStatusDto {
  @IsIn([USER_STATUSES.ACTIVE, USER_STATUSES.SUSPENDED, USER_STATUSES.DEACTIVATED])
  status: UserStatusCode;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateStaffDto extends PersonDto {
  @IsIn([ROLES.OPERATOR, ROLES.ADMIN])
  role: RoleCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;
}
