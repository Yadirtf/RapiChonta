import { AuthenticationError, DomainError, NotFoundError, PermissionDeniedError } from '../../../shared/domain/domain.error';

/** Errores del módulo files. El `code` es el contrato con la web y la app (lo traducen). */
export const FileErrors = {
  purposeNotAllowed: () => new PermissionDeniedError('FILE_PURPOSE_NOT_ALLOWED', 'No puede subir archivos de ese tipo'),
  typeNotAllowed: () => new DomainError('Tipo de archivo no permitido', 'FILE_TYPE_NOT_ALLOWED'),
  tooLarge: (maxBytes: number) => new DomainError('El archivo es demasiado grande', 'FILE_TOO_LARGE', { maxBytes }),
  invalidChecksum: () => new DomainError('Huella del archivo inválida', 'FILE_INVALID_CHECKSUM'),
  uploadExpired: () => new AuthenticationError('UPLOAD_EXPIRED', 'El permiso para subir el archivo venció'),
  uploadInvalid: () => new AuthenticationError('UPLOAD_INVALID', 'Permiso de subida inválido'),
  contentMismatch: () => new DomainError('El archivo recibido no coincide con el anunciado', 'FILE_CONTENT_MISMATCH'),
  notUploaded: () => new DomainError('El archivo todavía no se subió', 'FILE_NOT_UPLOADED'),
  notFound: () => new NotFoundError('FILE_NOT_FOUND', 'Archivo no encontrado'),
};
