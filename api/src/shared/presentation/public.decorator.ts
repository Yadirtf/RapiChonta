import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';

/** Endpoint abierto (sin sesión). Todo lo demás exige sesión: la API es segura por defecto. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
