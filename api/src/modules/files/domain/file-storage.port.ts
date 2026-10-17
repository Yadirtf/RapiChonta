export interface PresignedRequest {
  url: string;
  method: 'PUT' | 'GET';
  headers: Record<string, string>;
}

/**
 * Almacenamiento de los archivos (RNF-08). Las URLs se firman al pedirlas y vencen; nunca se guardan.
 * - `database`: los bytes van a `file_contents` y la propia API firma las URLs (sin servicios externos).
 * - `s3`: Cloudflare R2 o cualquier S3 compatible, con URLs prefirmadas (SigV4).
 */
export abstract class FileStorage {
  abstract readonly driver: 'database' | 's3';
  /** Destino de la subida. `ticket` es el permiso firmado que el modo `database` usa como URL. */
  abstract uploadRequest(input: { key: string; mimeType: string; sizeBytes: number; expiresAt: Date; ticket: string }): PresignedRequest;
  /** Bytes ya subidos (solo `s3`: se descargan una vez para verificar tamaño, huella y tipo real). */
  abstract read(key: string): Promise<Buffer | null>;
  /** URL de lectura firmada que vence en `expiresAt`. */
  abstract readUrl(input: { fileId: string; key: string; expiresAt: Date }): string;
}
