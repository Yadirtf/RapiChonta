import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { FileRepository, NewFile } from '../domain/file.repository';

@Injectable()
export class PrismaFileRepository extends FileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async purposeRules(code: string) {
    const purpose = await this.prisma.filePurpose.findFirst({ where: { code, deactivatedAt: null } });
    return purpose ? { maxSizeBytes: purpose.maxSizeBytes, allowedMimeTypes: purpose.allowedMimeTypes } : null;
  }

  async findReusable(purpose: string, sha256: string, withContent: boolean): Promise<string | null> {
    const file = await this.prisma.file.findFirst({
      where: { sha256, purpose: { code: purpose }, ...(withContent ? { content: { isNot: null } } : {}) },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return file?.id ?? null;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.file.count({ where: { id } })) > 0;
  }

  async create(file: NewFile): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const purpose = await tx.filePurpose.findUniqueOrThrow({ where: { code: file.purpose } });
      await tx.file.create({
        data: {
          id: file.id,
          purposeId: purpose.id,
          storageKey: file.storageKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          uploadedByUserId: file.uploadedByUserId,
        },
      });
      if (file.content) await tx.fileContent.create({ data: { fileId: file.id, content: new Uint8Array(file.content) } });
    });
  }

  async content(id: string) {
    const row = await this.prisma.fileContent.findUnique({ where: { fileId: id }, include: { file: { select: { mimeType: true } } } });
    return row ? { mimeType: row.file.mimeType, content: Buffer.from(row.content) } : null;
  }
}
