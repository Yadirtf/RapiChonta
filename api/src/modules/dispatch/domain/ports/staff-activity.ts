/** Una acción del personal (H07.5): de audit_logs o de las tablas que ya guardan quién y cuándo (v_staff_activity). */
export interface StaffActivityEntry {
  id: string;
  occurredAt: Date;
  actor: { userId: string; givenNames: string; familyNames: string | null; role: string | null } | null;
  action: string;
  entityTable: string;
  entityId: string;
  orderCode: string | null;
  details: Record<string, unknown> | null;
}

export interface StaffActivityQuery {
  /** Alcance: nulo = administrador global (ve también lo que no es de un pedido). */
  municipalityId: number | null;
  from?: Date;
  to?: Date;
  actorUserId?: string;
  orderCode?: string;
  /** Página siguiente: entradas anteriores a esta (occurred_at, id). */
  before?: { occurredAt: Date; id: string };
  limit: number;
}

export abstract class StaffActivityReader {
  abstract list(query: StaffActivityQuery): Promise<StaffActivityEntry[]>;
  /** Personal que aparece en el registro, para el filtro por usuario. */
  abstract actors(municipalityId: number | null): Promise<{ userId: string; givenNames: string; familyNames: string | null }[]>;
}
