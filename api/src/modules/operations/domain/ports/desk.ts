import { GeoPoint } from '../../../catalog/domain/value-objects/geo-point';
import { RoleCode } from '../../../identity/domain/identity.codes';
import { AlertMark } from '../desk';
import { ProofOutcome } from '../operations.codes';

export interface Person {
  givenNames: string;
  familyNames: string | null;
}

/** La novedad sin resolver de un pedido, con quién la tiene en sus manos. */
export interface OpenIncident {
  id: string;
  type: string;
  status: string;
  description: string | null;
  createdAt: Date;
  /** CUSTOMER si la reportó el cliente; STAFF si la abrió el personal al revisar una foto. */
  reportedByRole: string;
  takenBy: Person | null;
}

/** Un pedido en el panel (H10.5): lo justo para la lista, con sus alertas. */
export interface DeskOrder {
  id: string;
  code: string;
  status: string;
  statusSince: Date;
  createdAt: Date;
  establishment: { name: string };
  zoneName: string;
  customer: Person & { phone: string | null };
  courier: (Person & { userId: string; phone: string | null; holding: boolean }) | null;
  total: string;
  paymentMethod: string;
  alerts: AlertMark[];
  incident: OpenIncident | null;
  /** El rol de quien mira puede cancelarlo desde aquí (máquina de estados: antes de la compra). */
  cancellable: boolean;
}

export type DeskEvent =
  | { kind: 'STATUS'; at: Date; seq: number; from: string | null; to: string; actor: (Person & { role: string }) | null; source: string; note: string | null }
  | { kind: 'OFFER'; at: Date; mode: string; sentBy: Person | null; recipients: { name: Person; status: string; respondedAt: Date | null }[] }
  | { kind: 'RELEASE'; at: Date; courier: Person; reason: string; by: Person | null }
  | { kind: 'DELAY'; at: Date }
  | { kind: 'ADJUSTMENT'; at: Date; expiresAt: Date; lines: { name: string; reason: string; decision: string | null; decidedAt: Date | null }[] }
  | { kind: 'CODE_ATTEMPT'; at: Date }
  | { kind: 'COLLECTION'; at: Date; paymentMethod: string; amount: string }
  | { kind: 'INCIDENT'; at: Date; seq: number; incidentId: string; status: string; type: string; by: Person & { role: string }; resolution: string | null; note: string | null };

/** Todo lo del pedido para el detalle: la línea de tiempo con quién hizo qué y cuándo, y las pruebas. */
export interface DeskOrderDetail extends DeskOrder {
  lines: { name: string; quantity: number; unitPrice: string; removed: boolean }[];
  amounts: { items: string; deliveryFee: string; total: string };
  delivery: { label: string | null; line: string | null; reference: string | null; location: GeoPoint };
  notes: string | null;
  purchase: { amount: string; receiptFileId: string } | null;
  /** Foto de entrega: cuándo y a cuántos metros del punto de entrega se tomó (si había ubicación). */
  proof: { fileId: string; capturedAt: Date | null; distanceMeters: number | null } | null;
  collection: { total: string; payments: { paymentMethod: string; amount: string; at: Date }[] } | null;
  cancellation: { reason: string; notes: string | null } | null;
  timeline: DeskEvent[];
}

export abstract class DeskReader {
  /** Pedidos no terminados del municipio y los entregados con el cobro pendiente, con sus alertas. */
  abstract board(municipalityId: number, role: RoleCode): Promise<DeskOrder[]>;
  /** El pedido por código, con el municipio del local para validar el alcance; nulo si no existe. */
  abstract detail(code: string, role: RoleCode): Promise<(DeskOrderDetail & { municipalityId: number }) | null>;
  /** Los motivos que el personal elige al cancelar (los no automáticos). */
  abstract cancellationReasons(): Promise<string[]>;
  /** El municipio del pedido, para validar el alcance antes de una acción. */
  abstract orderScope(code: string): Promise<{ code: string; municipalityId: number } | null>;
  /** El municipio de la novedad, para validar el alcance. */
  abstract incidentScope(incidentId: string): Promise<{ orderCode: string; municipalityId: number } | null>;
}

export interface StaffActor {
  userId: string;
  role: RoleCode;
}

export type DeskResult = { ok: true; status: string } | { ok: false; reason: 'NOT_FOUND' | 'STEP' | 'REASON' | 'TYPE' | 'RESOLUTION' | 'CLOSED'; status?: string };

export abstract class DeskActions {
  /**
   * Cancela un pedido antes de la compra, en una transacción: retira las ofertas pendientes, libera al domiciliario
   * (que recibe TRIP_CANCELLED), guarda el motivo y el comentario, y lo pasa a CANCELLED con el rol del personal.
   */
  abstract cancel(actor: StaffActor, code: string, reason: string, notes: string): Promise<DeskResult>;
  /**
   * La entrega con foto: DELIVERED con el comentario, o un caso (tomado por quien lo abre) con el pedido en DISPUTED;
   * con CANCELLED, el caso se abre y se resuelve como cancelado en la misma transacción.
   */
  abstract reviewProof(actor: StaffActor, code: string, outcome: ProofOutcome, note: string, incidentType: string): Promise<DeskResult>;
  /** OPEN → IN_REVIEW: la toma quien la mira (los demás ven quién la tiene). */
  abstract takeIncident(actor: StaffActor, incidentId: string): Promise<DeskResult>;
  /**
   * Resuelve con la resolución del catálogo y el comentario: el pedido pasa al estado que esa resolución dice (con el
   * motivo INCIDENT_RESOLUTION si es cancelado) y el cliente y el domiciliario reciben INCIDENT_RESOLVED.
   */
  abstract resolveIncident(actor: StaffActor, incidentId: string, resolution: string, note: string): Promise<DeskResult>;
}
