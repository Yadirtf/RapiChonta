import { S3FileStorage } from './s3-file.storage';

/** Valores de referencia generados con botocore (generate_presigned_url, s3v4, estilo path). */
describe('S3FileStorage.presign', () => {
  const storage = new S3FileStorage({
    endpoint: 'https://acc123.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'rapichonta',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  });
  const now = new Date('2026-10-17T12:00:00Z');

  it('firma un GET igual que el SDK de AWS', () => {
    const url = storage.presign('GET', 'files/abc-123', new Date(now.getTime() + 3600_000), {}, now);
    expect(url).toBe(
      'https://acc123.r2.cloudflarestorage.com/rapichonta/files/abc-123?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIDEXAMPLE%2F20261017%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261017T120000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=2bf542b3022f24ae1891076cfad4ef285ef903809894dcde7d6ea011646da908',
    );
  });

  it('firma un PUT con el tipo de contenido como encabezado firmado', () => {
    const url = storage.presign('PUT', 'files/abc-123', new Date(now.getTime() + 600_000), { 'Content-Type': 'image/webp' }, now);
    expect(url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(url).toMatch(/X-Amz-Signature=0f4cb9b1c8b38a569715c67e76ff5c4ab74d6fcdb7a59711df2d4913d5fa0b89$/);
  });
});
