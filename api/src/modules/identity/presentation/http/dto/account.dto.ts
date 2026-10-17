import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { LANGUAGES, LanguageCode } from '../../../domain/identity.codes';

export class UpdateProfileDto {
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  givenNames: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  familyNames?: string | null;
}

export class SetLanguageDto {
  @IsIn(LANGUAGES)
  language: LanguageCode;
}

/** null = mostrar solo pesos. Las monedas salen del catálogo `currencies` (H03.4). */
export class SetDisplayCurrencyDto {
  @IsOptional()
  @IsIn(['USD', 'EUR'])
  currency: 'USD' | 'EUR' | null;
}

export class AcceptConsentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  legalDocumentVersionIds: string[];
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MaxLength(128)
  newPassword: string;
}

export class DeleteDataDto {
  /** Confirmación explícita: la eliminación no se puede deshacer. */
  @IsIn(['DELETE_MY_DATA'])
  confirmation: 'DELETE_MY_DATA';
}
