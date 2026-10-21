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
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FEE_ZONE_KINDS, ZONE_SHAPES, ZoneShapeCode } from '../../domain/business-config.codes';

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

  @IsIn(FEE_ZONE_KINDS)
  kind: (typeof FEE_ZONE_KINDS)[number];

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

export class PointQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

export class LatLngDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

/** Cobertura del municipio (H03.5): un radio alrededor de `center`, o el área dibujada en `area`. */
export class CoverageDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsIn(Object.values(ZONE_SHAPES))
  shape: ZoneShapeCode;

  @ValidateIf((o: CoverageDto) => o.shape === ZONE_SHAPES.CIRCLE)
  @ValidateNested()
  @Type(() => LatLngDto)
  center?: LatLngDto;

  @ValidateIf((o: CoverageDto) => o.shape === ZONE_SHAPES.CIRCLE)
  @IsNumber()
  radiusMeters?: number;

  @ValidateIf((o: CoverageDto) => o.shape === ZONE_SHAPES.POLYGON)
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(301)
  area?: [number, number][];

  @IsString()
  @Matches(MONEY)
  fee: string;
}

export class MunicipalityUpdateDto {
  @IsOptional()
  @IsBoolean()
  launched?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  center?: LatLngDto;
}
