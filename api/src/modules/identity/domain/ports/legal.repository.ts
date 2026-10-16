import { RoleCode } from '../identity.codes';

export interface LegalDocumentVersion {
  id: string;
  documentType: string;
  versionLabel: string;
  publishedAt: Date;
}

export abstract class LegalRepository {
  /** Versión vigente de cada documento que exigen los roles dados. */
  abstract currentRequiredFor(roles: RoleCode[]): Promise<LegalDocumentVersion[]>;
  /** Documentos exigidos por los roles vigentes del usuario que aún no ha aceptado (v_pending_consents). */
  abstract pendingFor(userId: string): Promise<LegalDocumentVersion[]>;
  abstract accept(userId: string, versionIds: string[], ipAddress?: string): Promise<void>;
}
