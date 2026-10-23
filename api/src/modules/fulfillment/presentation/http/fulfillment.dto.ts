import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { ADJUSTMENT_DECISIONS, ADJUSTMENT_REASONS, MAX_REPORTED_LINES } from '../../domain/adjustments';

/** Cada paso del domiciliario. Desde la cola sin señal (H08.8) llega con `queued` y la hora del teléfono. */
export class TripEventDto {
  /** UUID generado en la app: reenviar el mismo paso no lo repite. */
  @IsUUID()
  clientEventId: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @IsOptional()
  @IsBoolean()
  queued?: boolean;
}

export class PurchaseDto extends TripEventDto {
  /** Total pagado en el local, en pesos (texto decimal, RNF-05). */
  @IsString()
  @MaxLength(14)
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount: string;

  /** La foto de la factura, subida antes con el propósito PURCHASE_RECEIPT. */
  @IsUUID()
  receiptFileId: string;
}

export class TripQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(5)
  lang?: string;
}

export class DeliverDto extends TripEventDto {
  /** Los 4 dígitos que le dice el cliente. */
  @Matches(/^\d{4}$/)
  deliveryCode: string;
}

export class DeliveryProofDto extends TripEventDto {
  /** La foto de la entrega, subida antes con el propósito DELIVERY_PROOF. */
  @IsUUID()
  fileId: string;
}

/** Una línea con problema: no está, o el local pide otro precio por unidad. */
export class ReportedLineDto {
  @IsUUID()
  orderItemId: string;

  @IsIn(Object.values(ADJUSTMENT_REASONS))
  reason: (typeof ADJUSTMENT_REASONS)[keyof typeof ADJUSTMENT_REASONS];

  /** Solo con PRICE_CHANGED: el precio por unidad que pide ahora el local (texto decimal, RNF-05). */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  unitPrice?: string | null;
}

/** H09.2: todas las líneas con problema van en una sola consulta al cliente. */
export class ReportAdjustmentDto extends TripEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REPORTED_LINES)
  @ValidateNested({ each: true })
  @Type(() => ReportedLineDto)
  lines: ReportedLineDto[];
}

/** H09.3: una de las opciones cerradas (EXPIRED_REMOVED la toma solo el sistema). */
export class DecideAdjustmentDto {
  @IsIn(Object.values(ADJUSTMENT_DECISIONS).filter((d) => d !== ADJUSTMENT_DECISIONS.EXPIRED_REMOVED))
  decision: string;

  /** Con SUBSTITUTE: la versión del producto elegido en las sugerencias. */
  @IsOptional()
  @IsUUID()
  productVersionId?: string;
}
