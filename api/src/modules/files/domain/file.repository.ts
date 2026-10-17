export interface NewFile {
  id: string;
  purpose: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: string;
  /** Solo en el modo `database`. */
  content?: Buffer;
}

export abstract class FileRepository {
  abstract purposeRules(code: string): Promise<{ maxSizeBytes: number; allowedMimeTypes: string[] } | null>;
  /** Archivo igual (misma huella y propósito) ya guardado; con `withContent`, solo si sus bytes están en la base. */
  abstract findReusable(purpose: string, sha256: string, withContent: boolean): Promise<string | null>;
  abstract exists(id: string): Promise<boolean>;
  abstract create(file: NewFile): Promise<void>;
  abstract content(id: string): Promise<{ mimeType: string; content: Buffer } | null>;
}
