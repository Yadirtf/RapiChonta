import type { DeskBoardSnapshot, DeskOrderDetail, IncidentType, ProofOutcome } from "../entities/desk";
import type { IncidentResolution } from "../entities/order";

/** Puerto del panel de pedidos en curso (H10.5). Cada acción lleva el comentario del personal. */
export interface DeskRepository {
  board(municipalityId?: number): Promise<DeskBoardSnapshot>;
  detail(code: string): Promise<DeskOrderDetail>;
  cancellationReasons(): Promise<string[]>;
  cancel(code: string, input: { reason: string; notes: string }): Promise<void>;
  reviewProof(code: string, input: { outcome: ProofOutcome; notes: string; incidentType?: IncidentType }): Promise<void>;
  takeIncident(incidentId: string): Promise<void>;
  resolveIncident(incidentId: string, input: { resolution: IncidentResolution; notes: string }): Promise<void>;
}
