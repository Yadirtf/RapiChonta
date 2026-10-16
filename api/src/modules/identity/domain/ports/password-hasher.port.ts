export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(hash: string, plain: string): Promise<boolean>;
  /** Mismo costo que verify, para no revelar por el tiempo de respuesta si la cuenta existe. */
  abstract verifyDummy(plain: string): Promise<void>;
}
