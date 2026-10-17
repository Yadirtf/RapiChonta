import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { SAFE_IMAGE_TYPES, UPLOADABLE_PURPOSES } from '../../domain/file-purposes';

export class RequestUploadDto {
  @IsIn(Object.keys(UPLOADABLE_PURPOSES))
  purpose: string;

  @IsIn(SAFE_IMAGE_TYPES)
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes: number;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  sha256: string;
}
