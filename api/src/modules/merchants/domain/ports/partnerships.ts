/** Un convenio con el comercio: desde qué día y hasta cuál (null = sin fecha de fin). */
export interface Partnership {
  id: string;
  startedOn: string;
  endedOn: string | null;
  agreementFileId: string | null;
  createdAt: Date;
  createdBy: string;
}

export interface StoreMember {
  staffId: string;
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  grantedAt: Date;
  lastSignInAt: Date | null;
}

/** Lo que ve el panel en la ficha del local: el convenio vigente (o el próximo), los anteriores y quién lo atiende. */
export interface PartnershipView {
  establishment: { id: string; name: string; municipalityId: number; today: string };
  current: Partnership | null;
  upcoming: Partnership | null;
  past: Partnership[];
  members: StoreMember[];
}

export type PartnershipRefusal = 'NOT_FOUND' | 'ACTIVE' | 'NONE' | 'DATES' | 'FILE' | 'STAFF_EXISTS' | 'STAFF_NOT_FOUND' | 'NO_PARTNERSHIP';

export abstract class Partnerships {
  /** Nulo si el local no existe. */
  abstract view(establishmentId: string): Promise<PartnershipView | null>;
  /**
   * Firma un convenio desde `startedOn` (hoy o después, en la fecha del municipio). La base impide que se cruce con
   * otro (EXCLUDE) y exige que la foto del convenio sea de ese propósito.
   */
  abstract start(input: { establishmentId: string; startedOn: string; endedOn: string | null; agreementFileId: string | null; actorUserId: string }): Promise<PartnershipRefusal | null>;
  /** Termina el convenio vigente (o cancela el próximo) en `endedOn`; desde ese día el portal se cierra solo. */
  abstract end(input: { establishmentId: string; endedOn: string; actorUserId: string }): Promise<PartnershipRefusal | null>;
  /** El usuario con rol MERCHANT de ese número, si existe. */
  abstract merchantByPhone(phoneE164: string): Promise<{ userId: string } | null>;
  /** Da acceso al portal de ese local (la base exige el rol MERCHANT). */
  abstract addMember(input: { establishmentId: string; userId: string; actorUserId: string }): Promise<PartnershipRefusal | null>;
  abstract revokeMember(input: { establishmentId: string; staffId: string; actorUserId: string }): Promise<PartnershipRefusal | null>;
}
