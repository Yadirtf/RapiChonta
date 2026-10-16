import { RoleCode } from './identity.codes';

/** Quién hace la petición: el usuario, su sesión y el rol con que entró (RF-06). */
export interface Principal {
  userId: string;
  sessionId: string;
  role: RoleCode;
  permissions: ReadonlySet<string>;
  /** Alcance del rol activo; nulo para clientes y para un administrador global. */
  municipalityId: number | null;
}
