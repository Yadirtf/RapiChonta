import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RefreshTokenGenerator } from '../../domain/ports/token.port';

/** 256 bits aleatorios; en la base de datos solo queda el SHA-256 (si se filtra la tabla, no sirve). */
@Injectable()
export class RandomRefreshTokenGenerator extends RefreshTokenGenerator {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
