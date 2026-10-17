import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../identity/identity.module';
import { FileSigner } from './application/file-signer';
import { FileUrls } from './application/file-urls';
import { ReadFileUseCase } from './application/read-file.use-case';
import { CompleteUploadUseCase, ReceiveUploadUseCase, RequestUploadUseCase } from './application/upload-file.use-cases';
import { FileRepository } from './domain/file.repository';
import { FileStorage } from './domain/file-storage.port';
import { DatabaseFileStorage } from './infrastructure/database-file.storage';
import { PrismaFileRepository } from './infrastructure/prisma-file.repository';
import { S3FileStorage } from './infrastructure/s3-file.storage';
import { FilesController } from './presentation/files.controller';

/** FILE_STORAGE=s3 usa R2/S3 (S3_*); si no, los archivos se guardan en la base de datos. */
export function fileStorageFactory(config: ConfigService, signer: FileSigner): FileStorage {
  const logger = new Logger('FilesModule');
  if (config.get<string>('FILE_STORAGE') === 's3') {
    const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
    const missing = required.filter((key) => !config.get<string>(key));
    if (missing.length) throw new Error(`FILE_STORAGE=s3 exige ${missing.join(', ')}`);
    logger.log('Archivos en almacenamiento S3 compatible');
    return new S3FileStorage({
      endpoint: config.get<string>('S3_ENDPOINT')!,
      region: config.get<string>('S3_REGION') ?? 'auto',
      bucket: config.get<string>('S3_BUCKET')!,
      accessKeyId: config.get<string>('S3_ACCESS_KEY_ID')!,
      secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY')!,
    });
  }
  logger.log('Archivos en la base de datos (FILE_STORAGE=database)');
  return new DatabaseFileStorage(signer);
}

@Module({
  controllers: [FilesController],
  providers: [
    { provide: FileRepository, useClass: PrismaFileRepository },
    {
      provide: FileSigner,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new FileSigner(config.get<string>('FILES_SIGNING_SECRET') || `files:${resolveJwtSecret(config)}`),
    },
    { provide: FileStorage, inject: [ConfigService, FileSigner], useFactory: fileStorageFactory },
    FileUrls,
    RequestUploadUseCase,
    ReceiveUploadUseCase,
    CompleteUploadUseCase,
    ReadFileUseCase,
  ],
  exports: [FileUrls],
})
export class FilesModule {}
