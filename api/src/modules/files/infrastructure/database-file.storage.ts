import { FileStorage, PresignedRequest } from '../domain/file-storage.port';
import { Signer } from '../domain/signed-token';

/**
 * Almacenamiento en PostgreSQL (`file_contents`). Sirve mientras no haya un S3/R2: no depende de servicios
 * externos y sobrevive a los redespliegues del contenedor. Las URLs apuntan a la propia API, firmadas.
 * `basePath` es relativo ("/api/v1"): la web y la app lo resuelven contra la URL de la API que ya usan.
 */
export class DatabaseFileStorage extends FileStorage {
  readonly driver = 'database' as const;

  constructor(
    private readonly signer: Signer,
    private readonly basePath = '/api/v1',
  ) {
    super();
  }

  uploadRequest(input: { mimeType: string; ticket: string }): PresignedRequest {
    return { url: `${this.basePath}/files/uploads/${input.ticket}`, method: 'PUT', headers: { 'Content-Type': input.mimeType } };
  }

  async read(): Promise<Buffer | null> {
    return null;
  }

  readUrl({ fileId, expiresAt }: { fileId: string; expiresAt: Date }): string {
    const exp = Math.floor(expiresAt.getTime() / 1000);
    return `${this.basePath}/files/${fileId}/content?exp=${exp}&sig=${this.signer.sign(`${fileId}.${exp}`)}`;
  }
}
