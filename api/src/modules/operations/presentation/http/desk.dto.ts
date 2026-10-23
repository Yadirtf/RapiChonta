import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { INCIDENT_RESOLUTIONS, INCIDENT_TYPES } from '../../../fulfillment/domain/incidents';
import { MAX_NOTE_LENGTH, PROOF_OUTCOMES, ProofOutcome } from '../../domain/operations.codes';

export class DeskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;
}

/** El comentario del operador: el caso de uso exige que diga algo (queda en la auditoría). */
class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH * 2)
  notes?: string;
}

export class CancelOrderDto extends NoteDto {
  @IsString()
  @MaxLength(40)
  reason: string;
}

export class ReviewProofDto extends NoteDto {
  @IsIn(Object.values(PROOF_OUTCOMES))
  outcome: ProofOutcome;

  /** Al abrir un caso: qué se sospecha (por defecto OTHER). */
  @IsOptional()
  @IsIn(Object.values(INCIDENT_TYPES))
  incidentType?: string;
}

export class ResolveIncidentDto extends NoteDto {
  @IsIn(Object.values(INCIDENT_RESOLUTIONS))
  resolution: string;
}
