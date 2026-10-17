import { createHash } from 'node:crypto';
import { Principal } from '../../identity/domain/principal';
import { FileRepository, NewFile } from '../domain/file.repository';
import { DatabaseFileStorage } from '../infrastructure/database-file.storage';
import { FileSigner } from './file-signer';
import { FileUrls } from './file-urls';
import { ReadFileUseCase } from './read-file.use-case';
import { CompleteUploadUseCase, ReceiveUploadUseCase, RequestUploadUseCase } from './upload-file.use-cases';

class InMemoryFiles extends FileRepository {
  readonly files = new Map<string, NewFile>();
  async purposeRules(code: string) {
    return code === 'PRODUCT_IMAGE' ? { maxSizeBytes: 5 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] } : null;
  }
  async findReusable(purpose: string, sha256: string) {
    return [...this.files.values()].find((f) => f.purpose === purpose && f.sha256 === sha256)?.id ?? null;
  }
  async exists(id: string) {
    return this.files.has(id);
  }
  async create(file: NewFile) {
    this.files.set(file.id, file);
  }
  async content(id: string) {
    const file = this.files.get(id);
    return file?.content ? { mimeType: file.mimeType, content: file.content } : null;
  }
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const operator: Principal = { userId: 'u-1', sessionId: 's', role: 'OPERATOR', permissions: new Set(['products.manage']), municipalityId: 1 };

function setup() {
  const files = new InMemoryFiles();
  const signer = new FileSigner('test-secret');
  const storage = new DatabaseFileStorage(signer);
  return {
    files,
    signer,
    request: new RequestUploadUseCase(files, storage, signer),
    receive: new ReceiveUploadUseCase(files, storage, signer),
    complete: new CompleteUploadUseCase(files, storage, signer),
    read: new ReadFileUseCase(files, signer),
    urls: new FileUrls(storage),
  };
}

describe('subida de fotos (H02.3)', () => {
  it('pide permiso, recibe los bytes, confirma y sirve la foto con URL firmada', async () => {
    const { request, receive, complete, read, urls } = setup();
    const ticket = await request.execute(operator, { purpose: 'PRODUCT_IMAGE', mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG) });
    if (ticket.alreadyUploaded) throw new Error('no debería existir');
    expect(ticket.upload.url).toBe(`/api/v1/files/uploads/${ticket.ticket}`);

    await expect(complete.execute(operator, ticket.ticket)).rejects.toMatchObject({ code: 'FILE_NOT_UPLOADED' });
    await receive.execute(ticket.ticket, PNG);
    expect(await complete.execute(operator, ticket.ticket)).toEqual({ fileId: ticket.fileId });

    const url = new URL(urls.url(ticket.fileId)!, 'http://x');
    const file = await read.execute({ fileId: ticket.fileId, expires: Number(url.searchParams.get('exp')), signature: url.searchParams.get('sig')! });
    expect(file.mimeType).toBe('image/png');
    await expect(read.execute({ fileId: ticket.fileId, expires: Number(url.searchParams.get('exp')) + 1, signature: url.searchParams.get('sig')! })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });

  it('no vuelve a subir un archivo idéntico', async () => {
    const { files, request } = setup();
    await files.create({ id: 'f-1', purpose: 'PRODUCT_IMAGE', storageKey: 'files/f-1', mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG), uploadedByUserId: 'u-1', content: PNG });
    expect(await request.execute(operator, { purpose: 'PRODUCT_IMAGE', mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG) })).toEqual({
      fileId: 'f-1',
      alreadyUploaded: true,
    });
  });

  it('valida permiso, tipo y tamaño antes de firmar', async () => {
    const { request } = setup();
    const input = { purpose: 'PRODUCT_IMAGE', mimeType: 'image/png', sizeBytes: 10, sha256: 'a'.repeat(64) };
    await expect(request.execute({ ...operator, permissions: new Set() }, input)).rejects.toMatchObject({ code: 'FILE_PURPOSE_NOT_ALLOWED' });
    await expect(request.execute(operator, { ...input, purpose: 'COURIER_DOCUMENT' })).rejects.toMatchObject({ code: 'FILE_PURPOSE_NOT_ALLOWED' });
    await expect(request.execute(operator, { ...input, mimeType: 'image/gif' })).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    await expect(request.execute(operator, { ...input, sizeBytes: 6 * 1024 * 1024 })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rechaza bytes que no coinciden con lo anunciado o un permiso alterado o vencido', async () => {
    const { request, receive, complete } = setup();
    const ticket = await request.execute(operator, { purpose: 'PRODUCT_IMAGE', mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG) });
    if (ticket.alreadyUploaded) throw new Error('no debería existir');
    const fake = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(PNG.length - 6)]);
    await expect(receive.execute(ticket.ticket, fake)).rejects.toMatchObject({ code: 'FILE_CONTENT_MISMATCH' });
    await expect(receive.execute(`${ticket.ticket}x`, PNG)).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
    await expect(complete.execute({ ...operator, userId: 'otro' }, ticket.ticket)).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });

    const expired = await request.execute(operator, { purpose: 'PRODUCT_IMAGE', mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG) }, new Date(Date.now() - 3_600_000));
    if (expired.alreadyUploaded) throw new Error('no debería existir');
    await expect(receive.execute(expired.ticket, PNG)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
  });
});
