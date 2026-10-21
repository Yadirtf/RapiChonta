import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { PUSH_PROVIDERS, PushProviderCode } from '../../domain/notifications.codes';

export class RegisterPushTokenDto {
  @IsIn(Object.values(PUSH_PROVIDERS))
  provider: PushProviderCode;

  @IsString()
  @Length(16, 512)
  token: string;
}

export class MyNotificationsQueryDto {
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

export class MarkReadDto {
  /** Sin ids, se marcan todos. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}
