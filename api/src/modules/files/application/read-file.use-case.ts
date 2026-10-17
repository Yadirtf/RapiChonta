import { Injectable } from '@nestjs/common';
import { FileErrors } from '../domain/files.errors';
import { FileRepository } from '../domain/file.repository';
import { FileSigner } from './file-signer';

/** Lectura con URL firmada en el modo `database`: firma válida y no vencida, o 404. */
@Injectable()
export class ReadFileUseCase {
  constructor(
    private readonly files: FileRepository,
    private readonly signer: FileSigner,
  ) {}

  async execute(input: { fileId: string; expires: number; signature: string }, now = new Date()) {
    if (!Number.isFinite(input.expires) || input.expires * 1000 < now.getTime()) throw FileErrors.notFound();
    if (!this.signer.verify(`${input.fileId}.${input.expires}`, input.signature)) throw FileErrors.notFound();
    const file = await this.files.content(input.fileId);
    if (!file) throw FileErrors.notFound();
    return { ...file, maxAgeSeconds: Math.max(0, input.expires - Math.floor(now.getTime() / 1000)) };
  }
}
