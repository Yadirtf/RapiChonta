import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LANGUAGES, OTP_CHANNELS, OtpChannelCode, ROLE_CODES, RoleCode } from '../../../domain/identity.codes';
import { DeviceDto } from './device.dto';

const CODE = /^\d{6}$/;

export class RequestCodeDto {
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsIn(Object.values(OTP_CHANNELS))
  channel: OtpChannelCode = OTP_CHANNELS.SMS;

  @IsOptional()
  @IsIn(LANGUAGES)
  language: string = 'es';
}

export class VerifyCodeDto {
  @IsUUID()
  challengeId: string;

  @Matches(CODE)
  code: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class RegisterDto {
  @IsString()
  @MinLength(20)
  registrationToken: string;

  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  givenNames: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  familyNames?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  acceptedLegalVersionIds: string[];

  @IsOptional()
  @IsIn(LANGUAGES)
  language: string = 'es';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class PasswordSignInDto extends RequestCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class CompletePasswordSignInDto extends VerifyCodeDto {
  @IsOptional()
  @IsIn(ROLE_CODES)
  role?: RoleCode;
}

export class RefreshDto {
  /** Solo la app; la web usa la cookie HttpOnly. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  refreshToken?: string;
}

export class SwitchRoleDto {
  @IsIn(ROLE_CODES)
  role: RoleCode;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
