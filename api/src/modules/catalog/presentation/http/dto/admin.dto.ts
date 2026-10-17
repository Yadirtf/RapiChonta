import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ESTABLISHMENT_STATUSES, PRODUCT_STATUSES } from '../../../domain/catalog.codes';

export class NamesDto {
  @IsString()
  @MaxLength(80)
  es: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  en?: string;
}

export class LatLngDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class PhoneDto {
  @IsString()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string | null;
}

export class EstablishmentDto {
  @IsOptional()
  @IsInt()
  municipalityId?: number;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(200)
  addressLine: string;

  @ValidateNested()
  @Type(() => LatLngDto)
  location: LatLngDto;

  /** Vértices [lng, lat]; el dominio valida forma, cruces y tamaño. */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(101)
  area: [number, number][];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { each: true })
  categories: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PhoneDto)
  phones?: PhoneDto[];

  @IsOptional()
  @IsUUID()
  logoFileId?: string | null;
}

export class ListEstablishmentsQueryDto {
  @IsOptional()
  @IsIn(Object.values(ESTABLISHMENT_STATUSES))
  status?: (typeof ESTABLISHMENT_STATUSES)[keyof typeof ESTABLISHMENT_STATUSES];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class EstablishmentStatusDto {
  @IsIn(Object.values(ESTABLISHMENT_STATUSES))
  status: (typeof ESTABLISHMENT_STATUSES)[keyof typeof ESTABLISHMENT_STATUSES];
}

export class SectionDto {
  @ValidateNested()
  @Type(() => NamesDto)
  names: NamesDto;
}

export class OrderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class CategoryOrderDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids: number[];
}

export class ProductTextDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string | null;
}

export class ProductTextsDto {
  @ValidateNested()
  @Type(() => ProductTextDto)
  es: ProductTextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductTextDto)
  en?: ProductTextDto;
}

export class ProductDto {
  @IsUUID()
  sectionId: string;

  @ValidateNested()
  @Type(() => ProductTextsDto)
  texts: ProductTextsDto;

  /** Pesos colombianos como texto decimal ("12000" o "12000.50"): nunca un número de punto flotante. */
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  price: string;

  @IsInt()
  @Min(0)
  @Max(240)
  prepMinutes: number;
}

export class ProductStatusDto {
  @IsIn(Object.values(PRODUCT_STATUSES))
  status: (typeof PRODUCT_STATUSES)[keyof typeof PRODUCT_STATUSES];
}

export class ProductImageDto {
  @IsUUID()
  fileId: string;
}

export class CategoryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,39}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ValidateNested()
  @Type(() => NamesDto)
  names: NamesDto;
}

export class CategoryActiveDto {
  @IsIn([true, false])
  active: boolean;
}
