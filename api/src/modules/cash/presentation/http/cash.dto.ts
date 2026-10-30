import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { ADJUSTMENT_DIRECTIONS, AdjustmentDirection, MAX_NOTE_LENGTH, MAX_RETURN_PAYMENTS } from '../../domain/cash.codes';

/** Pesos en texto decimal (RNF-05). El caso de uso exige que sea mayor que cero. */
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

export class CashBoardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

  /** YYYY-MM-DD; por defecto hoy en el municipio. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  date?: string;
}

export class CourierCashQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  date?: string;
}

class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH * 2)
  note?: string;
}

export class OpenCashBoxDto extends NoteDto {
  @IsUUID()
  courierUserId: string;

  @IsString()
  @Matches(AMOUNT)
  amount: string;

  @IsString()
  @MaxLength(40)
  paymentMethod: string;
}

export class CashAdjustmentDto extends NoteDto {
  /** Para anular un movimiento: el sentido y el monto salen de él. */
  @IsOptional()
  @IsUUID()
  reversesMovementId?: string;

  @IsOptional()
  @IsIn(Object.values(ADJUSTMENT_DIRECTIONS))
  direction?: AdjustmentDirection;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  amount?: string;
}

export class ReceivedPaymentDto {
  @IsString()
  @MaxLength(40)
  paymentMethod: string;

  @IsString()
  @Matches(AMOUNT)
  amount: string;
}

export class CloseCashBoxDto {
  @IsArray()
  @ArrayMaxSize(MAX_RETURN_PAYMENTS)
  @ValidateNested({ each: true })
  @Type(() => ReceivedPaymentDto)
  received: ReceivedPaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH * 2)
  notes?: string;
}
