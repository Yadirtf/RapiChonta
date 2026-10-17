import { createHash, createHmac } from 'node:crypto';
import { FileStorage, PresignedRequest } from '../domain/file-storage.port';

export interface S3Config {
  /** https://<cuenta>.r2.cloudflarestorage.com, https://s3.<región>.amazonaws.com, MinIO… */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Cloudflare R2 o cualquier S3 compatible con URLs prefirmadas (AWS Signature V4, rutas estilo path).
 * La firma se calcula aquí para no cargar el SDK de AWS en un contenedor de 512 MB.
 */
export class S3FileStorage extends FileStorage {
  readonly driver = 's3' as const;
  private readonly endpoint: URL;

  constructor(private readonly config: S3Config) {
    super();
    this.endpoint = new URL(config.endpoint);
  }

  uploadRequest(input: { key: string; mimeType: string; sizeBytes: number; expiresAt: Date }): PresignedRequest {
    const headers = { 'Content-Type': input.mimeType };
    return { url: this.presign('PUT', input.key, input.expiresAt, { 'content-type': input.mimeType }), method: 'PUT', headers };
  }

  async read(key: string): Promise<Buffer | null> {
    const response = await fetch(this.presign('GET', key, new Date(Date.now() + 60_000)));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Almacenamiento S3 respondió ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  readUrl({ key, expiresAt }: { key: string; expiresAt: Date }): string {
    return this.presign('GET', key, expiresAt);
  }

  /** URL prefirmada (query string). `signedHeaders` además de host: el cliente debe enviarlos iguales. */
  presign(method: string, key: string, expiresAt: Date, signedHeaders: Record<string, string> = {}, now = new Date()): string {
    const { region, bucket, accessKeyId, secretAccessKey } = this.config;
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${region}/s3/aws4_request`;
    const expires = Math.max(1, Math.min(604_800, Math.round((expiresAt.getTime() - now.getTime()) / 1000)));
    const basePath = this.endpoint.pathname.replace(/\/$/, '');
    const path = `${basePath}/${encodePath(bucket)}/${encodePath(key)}`;

    const headers: Record<string, string> = { host: this.endpoint.host, ...lowerKeys(signedHeaders) };
    const headerNames = Object.keys(headers).sort();
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': headerNames.join(';'),
    };
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
      .join('&');
    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      headerNames.map((h) => `${h}:${headers[h].trim()}\n`).join(''),
      headerNames.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = ['s3', 'aws4_request'].reduce(
      (key, part) => hmac(key, part),
      hmac(hmac(`AWS4${secretAccessKey}`, day), region),
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return `${this.endpoint.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}

const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const sha256Hex = (data: string) => createHash('sha256').update(data).digest('hex');
const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (value: string) => value.split('/').map(rfc3986).join('/');
const lowerKeys = (record: Record<string, string>) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
