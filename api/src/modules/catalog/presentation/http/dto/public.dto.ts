import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, Matches, Max, Min } from 'class-validator';
import { CONTENT_LANGUAGES } from '../../../domain/catalog.codes';

export class FindNearbyQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(15000)
  radius?: number;

  /** Códigos de categoría separados por coma; las categorías son un catálogo del negocio (no una lista fija). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { each: true })
  categories?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class EstablishmentQueryDto {
  @IsOptional()
  @IsIn(CONTENT_LANGUAGES)
  lang?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
