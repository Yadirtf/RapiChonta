import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import { EstablishmentCategory } from '../../../domain/entities/establishment.entity';

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

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(EstablishmentCategory, { each: true })
  categories?: EstablishmentCategory[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
