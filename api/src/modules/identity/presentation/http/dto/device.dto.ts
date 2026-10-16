import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PLATFORMS, PlatformCode } from '../../../domain/identity.codes';

/** Instalación de la app o navegador desde donde se entra (devices). */
export class DeviceDto {
  @IsUUID()
  installationId: string;

  @IsIn(Object.values(PLATFORMS))
  platform: PlatformCode;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}
