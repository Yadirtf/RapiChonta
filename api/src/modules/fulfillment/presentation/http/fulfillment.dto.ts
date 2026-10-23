import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { ADJUSTMENT_DECISIONS, ADJUSTMENT_REASONS, MAX_REPORTED_LINES } from '../../domain/adjustments';
import { MAX_COLLECTION_PAYMENTS } from '../../domain/collection';
import { MAX_INCIDENT_DESCRIPTION } from '../../domain/incidents';

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

/** Donde está el domiciliario ahora (su GPS), para trazar la ruta. */
export class RouteQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
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

/** Un medio con su valor: "Efectivo $30.000" y "Nequi $12.500" son dos. */
export class CollectedPaymentDto {
  @IsString()
  @MaxLength(40)
  paymentMethod: string;

  /** Pesos en texto decimal (RNF-05). */
  @IsString()
  @MaxLength(14)
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount: string;
}

/** H10.2: cómo le pagó el cliente. Sale también de la cola sin señal, con la hora del teléfono. */
export class CollectionDto extends TripEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COLLECTION_PAYMENTS)
  @ValidateNested({ each: true })
  @Type(() => CollectedPaymentDto)
  payments: CollectedPaymentDto[];
}

/** La imagen del QR de la cuenta, subida antes con el propósito COLLECTION_QR. */
export class CollectionQrDto {
  @IsUUID()
  fileId: string;
}

/** H10.3: "No lo recibí", con lo que el cliente quiera contar. */
export class NotReceivedDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_INCIDENT_DESCRIPTION)
  description?: string;
}
