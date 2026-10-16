import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';

/** Argon2id con los parámetros recomendados por OWASP (19 MiB, 2 iteraciones). */
const OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }

  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= hash('rapichonta-dummy-password', OPTIONS);
    await this.verify(await this.dummyHash, plain);
  }
}
