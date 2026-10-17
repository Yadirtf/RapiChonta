import { Injectable } from '@nestjs/common';
import { storageKeyOf } from '../domain/file-purposes';
import { FileStorage } from '../domain/file-storage.port';
import { bucketedExpiry } from '../domain/signed-token';

/** Las URLs de lectura viven 6 a 12 horas y se repiten dentro de la misma ventana (caché del navegador). */
export const READ_URL_WINDOW_SECONDS = 6 * 60 * 60;

/**
 * URLs firmadas de lectura (RNF-08). Otros módulos (catálogo, pedidos, entregas) la usan para mostrar fotos
 * sin exponer el almacenamiento: nunca se guardan, se calculan en cada respuesta.
 */
@Injectable()
export class FileUrls {
  constructor(private readonly storage: FileStorage) {}

  url(fileId: string | null | undefined, now = new Date()): string | null {
    if (!fileId) return null;
    return this.storage.readUrl({ fileId, key: storageKeyOf(fileId), expiresAt: bucketedExpiry(now, READ_URL_WINDOW_SECONDS) });
  }
}
