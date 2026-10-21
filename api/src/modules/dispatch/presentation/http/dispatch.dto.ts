import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OFFER_MODES, OfferModeCode } from '../../domain/dispatch.codes';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class BoardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;
}

export class CouriersQueryDto extends BoardQueryDto {
  /** Código del pedido elegido: ordena por distancia a su local. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  order?: string;
}

export class SendOfferDto {
  @IsIn(Object.values(OFFER_MODES))
  mode: OfferModeCode;

  @ValidateIf((d: SendOfferDto) => d.mode === OFFER_MODES.SPECIFIC)
  @IsUUID()
  courierUserId?: string;
}

export class AvailabilityDto {
  @IsBoolean()
  available: boolean;
}

export class LocationReadingDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999)
  accuracyM?: number | null;

  /** Hora del GPS (puede llegar tarde si no había señal). */
  @IsISO8601({ strict: true })
  recordedAt: string;
}

export class LocationBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LocationReadingDto)
  readings: LocationReadingDto[];
}

export class AuditQueryDto {
  /** Días de Bogotá (AAAA-MM-DD), ambos incluidos. */
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @IsOptional()
  @Matches(DAY)
  to?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  order?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
