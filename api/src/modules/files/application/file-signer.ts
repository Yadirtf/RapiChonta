import { Signer } from '../domain/signed-token';

/** Firmador de los permisos de subida y de las URLs de lectura (se construye en el módulo con su secreto). */
export class FileSigner extends Signer {}
