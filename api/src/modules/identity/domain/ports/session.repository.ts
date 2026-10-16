import { PlatformCode, RoleCode, SessionEndReasonCode } from '../identity.codes';

export interface DeviceInfo {
  installationId: string;
  platform: PlatformCode;
  appVersion?: string;
}

export interface NewSession {
  userId: string;
  role: RoleCode;
  device?: DeviceInfo;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

export interface StoredRefreshToken {
  id: string;
  sessionId: string;
  userId: string;
  role: RoleCode;
  expiresAt: Date;
  consumedAt: Date | null;
  sessionEndedAt: Date | null;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  role: RoleCode;
  canSignIn: boolean;
  /** Alcance del rol activo (municipio); nulo si el rol ya no está vigente o es global. */
  roleStillGranted: boolean;
  municipalityId: number | null;
}

export abstract class SessionRepository {
  abstract create(session: NewSession): Promise<string>;
  abstract findRefreshToken(hash: string): Promise<StoredRefreshToken | null>;
  /** Consume el token vigente y emite el siguiente. Devuelve false si el token ya se había usado. */
  abstract rotate(input: { tokenId: string; sessionId: string; newHash: string; expiresAt: Date }): Promise<boolean>;
  abstract findActive(sessionId: string): Promise<ActiveSession | null>;
  abstract setActiveRole(sessionId: string, role: RoleCode): Promise<void>;
  abstract end(sessionId: string, reason: SessionEndReasonCode): Promise<void>;
  abstract endAllForUser(userId: string, reason: SessionEndReasonCode): Promise<void>;
  /** Cierra las demás sesiones del usuario (por ejemplo, al cambiar la contraseña). */
  abstract endOthers(userId: string, keepSessionId: string, reason: SessionEndReasonCode): Promise<void>;
}
