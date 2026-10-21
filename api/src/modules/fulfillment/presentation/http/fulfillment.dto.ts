import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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
