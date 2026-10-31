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
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CONTENT_LANGUAGES } from '../../../catalog/domain/catalog.codes';
import { CHECKOUT_LIMITS } from '../../domain/checkout';

export class CartItemDto {
  @IsUUID()
  productVersionId: string;

  @IsInt()
  @Min(1)
  @Max(CHECKOUT_LIMITS.quantity)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(CHECKOUT_LIMITS.notes)
  notes?: string | null;
}

/** Una dirección guardada (`addressId`) o un punto con referencia. */
export class DeliveryDto {
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ValidateIf((d: DeliveryDto) => !d.addressId)
  @IsLatitude()
  latitude?: number;

  @ValidateIf((d: DeliveryDto) => !d.addressId)
  @IsLongitude()
  longitude?: number;

  /** Obligatoria al confirmar (lo valida el caso de uso); para cotizar basta el punto. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line?: string | null;

  /** Con nombre se guarda para reutilizarla ("Casa"); sin nombre es de un solo uso. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string | null;
}

export class RecipientDto {
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @ValidateIf((r: RecipientDto) => !r.recipientId)
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ValidateIf((r: RecipientDto) => !r.recipientId)
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class QuoteOrderDto {
  @IsUUID()
  establishmentId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHECKOUT_LIMITS.lines)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  @ValidateNested()
  @Type(() => DeliveryDto)
  delivery: DeliveryDto;

  @IsOptional()
  @IsIn(CONTENT_LANGUAGES)
  lang?: string;
}

export class CreateOrderDto extends QuoteOrderDto {
  @IsString()
  @MaxLength(40)
  paymentMethod: string;

  /** E15: sin modo, la compra por RapiChonta (lo que entienden las apps de antes). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fulfillmentMode?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientDto)
  recipient?: RecipientDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(CHECKOUT_LIMITS.customerNotes)
  notes?: string | null;

  /** UUID que genera el dispositivo por intento de compra: el reintento devuelve el mismo pedido. */
  @IsUUID()
  clientRequestId: string;
}

export class MyOrdersQueryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class OrderQueryDto {
  @IsOptional()
  @IsIn(CONTENT_LANGUAGES)
  lang?: string;
}

export class SaveAddressDto {
  @IsString()
  @MaxLength(40)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line?: string | null;

  @IsString()
  @MaxLength(200)
  reference: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}

/** Panel: el nuevo orden de "¿Cómo pagas al recibir?", con todos los medios. */
export class PaymentOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  codes: string[];
}

/** Panel: mostrar u ocultar un medio, o cambiar su imagen (null la quita). */
export class PaymentOptionDto {
  @IsOptional()
  @IsBoolean()
  offered?: boolean;

  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;
}
