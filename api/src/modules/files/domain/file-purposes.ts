/**
 * Qué propósitos de `file_purposes` se pueden subir hoy y con qué permiso. Los demás (factura, foto de
 * entrega, documento del domiciliario) se habilitan en sus historias (H08.4, H10.4, H01.3).
 */
export const UPLOADABLE_PURPOSES: Record<string, string> = {
  PRODUCT_IMAGE: 'products.manage',
  ESTABLISHMENT_LOGO: 'establishments.manage',
};

/** Tipos que la API acepta aunque el catálogo permita otros: solo imágenes rasterizadas (un SVG puede llevar scripts). */
export const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Reconoce el tipo real por los primeros bytes; no se confía en el Content-Type que manda el cliente. */
export function sniffImageType(head: Uint8Array): string | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
  return null;
}

/** Clave en el almacenamiento: solo depende del id, así la URL de lectura no exige leer la base. */
export const storageKeyOf = (fileId: string) => `files/${fileId}`;
