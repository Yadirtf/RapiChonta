import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ZONE_KINDS } from '../../domain/business-config.codes';

const MONEY = /^\d{1,10}([.,]\d{1,2})?$/;
const CLOCK = /^\d{2}:\d{2}$/;

export class MunicipalityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;
}

export class ZoneDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsIn(Object.values(ZONE_KINDS))
  kind: (typeof ZONE_KINDS)[keyof typeof ZONE_KINDS];

  /** Vértices [lng, lat]; el dominio valida forma, cruces y tamaño. */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(301)
  area: [number, number][];

  @IsString()
  @Matches(MONEY)
  fee: string;

  @IsOptional()
  @IsBoolean()
  trimOverlaps?: boolean;
}

export class TrimZoneDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(301)
  area: [number, number][];

  @IsOptional()
  @IsUUID()
  exceptId?: string;
}

export class ZoneOrderDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class SlotDto {
  @Matches(CLOCK)
  opensAt: string;

  @Matches(CLOCK)
  closesAt: string;
}

export class DayDto {
  @IsInt()
  weekday: number;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots: SlotDto[];
}

export class WeeklyScheduleDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  days: DayDto[];
}

export class ScheduleExceptionDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsBoolean()
  closed: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots?: SlotDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string | null;
}

export class SettingValueDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsString()
  @Matches(/^\d{1,12}$/)
  value: string;

  @IsIn(['GLOBAL', 'MUNICIPALITY'])
  scope: 'GLOBAL' | 'MUNICIPALITY';
}

export class CommissionDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsString()
  @Matches(/^\d{1,2}([.,]\d{1,2})?$/)
  percent: string;
}

export class QuoteQueryDto {
  @IsUUID()
  establishmentId: string;

  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}
