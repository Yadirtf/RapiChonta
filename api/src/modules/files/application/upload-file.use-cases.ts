import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Principal } from '../../identity/domain/principal';
import { FileErrors } from '../domain/files.errors';
import { PRIVATE_PURPOSES, SAFE_IMAGE_TYPES, sniffImageType, storageKeyOf, UPLOADABLE_PURPOSES } from '../domain/file-purposes';
import { FileRepository } from '../domain/file.repository';
import { FileStorage, PresignedRequest } from '../domain/file-storage.port';
import { FileSigner } from './file-signer';
import { UPLOAD_TICKET_SECONDS, UploadTicket } from './upload-ticket';

export interface UploadRequestInput {
  purpose: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export type UploadRequestResult =
  | { fileId: string; alreadyUploaded: true }
  | { fileId: string; alreadyUploaded: false; ticket: string; upload: PresignedRequest; expiresAt: Date };

/**
 * Paso 1 de la subida (H02.3, RNF-08): valida propósito, tipo y tamaño, y entrega una URL firmada que vence.
 * Si el mismo archivo (sha256) ya existe para ese propósito, no se vuelve a subir.
 */
@Injectable()
export class RequestUploadUseCase {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: FileStorage,
    private readonly signer: FileSigner,
  ) {}

  async execute(principal: Principal, input: UploadRequestInput, now = new Date()): Promise<UploadRequestResult> {
    const permission = UPLOADABLE_PURPOSES[input.purpose];
    if (!permission || !principal.permissions.has(permission)) throw FileErrors.purposeNotAllowed();
    const rules = await this.files.purposeRules(input.purpose);
    if (!rules) throw FileErrors.purposeNotAllowed();
    const mime = input.mimeType.toLowerCase();
    if (!rules.allowedMimeTypes.includes(mime) || !(SAFE_IMAGE_TYPES as readonly string[]).includes(mime)) throw FileErrors.typeNotAllowed();
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) throw FileErrors.contentMismatch();
    if (input.sizeBytes > rules.maxSizeBytes) throw FileErrors.tooLarge(rules.maxSizeBytes);
    const sha = input.sha256.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw FileErrors.invalidChecksum();

    const existing = PRIVATE_PURPOSES.includes(input.purpose) ? null : await this.files.findReusable(input.purpose, sha, this.storage.driver === 'database');
    if (existing) return { fileId: existing, alreadyUploaded: true };

    const fileId = randomUUID();
    const expiresAt = new Date(now.getTime() + UPLOAD_TICKET_SECONDS * 1000);
    const ticket = this.signer.seal({
      fid: fileId,
      uid: principal.userId,
      purpose: input.purpose,
      mime,
      size: input.sizeBytes,
      sha,
      exp: Math.floor(expiresAt.getTime() / 1000),
    } satisfies UploadTicket);
    const upload = this.storage.uploadRequest({ key: storageKeyOf(fileId), mimeType: mime, sizeBytes: input.sizeBytes, expiresAt, ticket });
    return { fileId, alreadyUploaded: false, ticket, upload, expiresAt };
  }
}

/** Abre y valida un permiso de subida. */
export function openTicket(signer: FileSigner, token: string, now = new Date()): UploadTicket {
  const ticket = signer.open<UploadTicket>(token);
  if (!ticket?.fid || !ticket.uid) throw FileErrors.uploadInvalid();
  if (ticket.exp * 1000 < now.getTime()) throw FileErrors.uploadExpired();
  return ticket;
}

/** El archivo recibido es exactamente el anunciado: tamaño, huella y tipo real (por sus primeros bytes). */
export function verifyContent(ticket: UploadTicket, content: Buffer): void {
  if (content.length !== ticket.size) throw FileErrors.contentMismatch();
  if (createHash('sha256').update(content).digest('hex') !== ticket.sha) throw FileErrors.contentMismatch();
  if (sniffImageType(content.subarray(0, 16)) !== ticket.mime) throw FileErrors.contentMismatch();
}

/**
 * Paso 2 en el modo `database`: la URL firmada apunta a la API, que recibe los bytes y los guarda.
 * El permiso firmado reemplaza a la sesión (igual que una URL prefirmada de S3).
 */
@Injectable()
export class ReceiveUploadUseCase {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: FileStorage,
    private readonly signer: FileSigner,
  ) {}

  async execute(token: string, content: Buffer): Promise<{ fileId: string }> {
    if (this.storage.driver !== 'database') throw FileErrors.uploadInvalid();
    const ticket = openTicket(this.signer, token);
    if (await this.files.exists(ticket.fid)) return { fileId: ticket.fid };
    verifyContent(ticket, content);
    await this.files.create({
      id: ticket.fid,
      purpose: ticket.purpose,
      storageKey: storageKeyOf(ticket.fid),
      mimeType: ticket.mime,
      sizeBytes: ticket.size,
      sha256: ticket.sha,
      uploadedByUserId: ticket.uid,
      content,
    });
    return { fileId: ticket.fid };
  }
}

/**
 * Paso 3: confirmar la subida. En `s3` se descarga el objeto una vez para verificarlo antes de registrarlo;
 * en `database` ya quedó registrado al recibirlo. Es idempotente.
 */
@Injectable()
export class CompleteUploadUseCase {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: FileStorage,
    private readonly signer: FileSigner,
  ) {}

  async execute(principal: Principal, token: string): Promise<{ fileId: string }> {
    const ticket = openTicket(this.signer, token);
    if (ticket.uid !== principal.userId) throw FileErrors.uploadInvalid();
    if (await this.files.exists(ticket.fid)) return { fileId: ticket.fid };
    if (this.storage.driver === 'database') throw FileErrors.notUploaded();

    const key = storageKeyOf(ticket.fid);
    const content = await this.storage.read(key);
    if (!content) throw FileErrors.notUploaded();
    verifyContent(ticket, content);
    await this.files.create({
      id: ticket.fid,
      purpose: ticket.purpose,
      storageKey: key,
      mimeType: ticket.mime,
      sizeBytes: ticket.size,
      sha256: ticket.sha,
      uploadedByUserId: ticket.uid,
    });
    return { fileId: ticket.fid };
  }
}
