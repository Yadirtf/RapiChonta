import { NotFoundError } from '../domain/domain.error';

/**
 * Regla de propiedad (H01.2, RNF-01): quien pide un recurso ajeno recibe 404, no 403, para no revelar que existe.
 * Los casos de uso la aplican después de leer el recurso: `ensureOwnedBy(order?.customerUserId, principal.userId)`.
 */
export function ensureOwnedBy<T extends string | null | undefined>(ownerUserId: T, requesterUserId: string, code = 'NOT_FOUND'): void {
  if (!ownerUserId || ownerUserId !== requesterUserId) throw new NotFoundError(code);
}
