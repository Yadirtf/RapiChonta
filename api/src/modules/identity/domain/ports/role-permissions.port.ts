import { RoleCode } from '../identity.codes';

/** Permisos de cada rol (role_permissions), cargados en memoria al arrancar. */
export abstract class RolePermissions {
  abstract permissionsOf(role: RoleCode): ReadonlySet<string>;
}
