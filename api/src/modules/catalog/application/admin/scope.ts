import { Principal } from '../../../identity/domain/principal';
import { CatalogErrors } from '../../domain/catalog.errors';

/**
 * Alcance del rol (E01): el operador solo administra los locales de su municipio; el administrador global,
 * todos. Fuera del alcance se responde 404, igual que si no existiera.
 */
export function ensureInScope(principal: Principal, municipalityId: number | null | undefined): void {
  if (municipalityId == null) throw CatalogErrors.establishmentNotFound();
  if (principal.municipalityId !== null && principal.municipalityId !== municipalityId) throw CatalogErrors.establishmentNotFound();
}
