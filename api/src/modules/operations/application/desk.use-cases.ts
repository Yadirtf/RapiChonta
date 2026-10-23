import { Injectable } from '@nestjs/common';
import { MunicipalityScope } from '../../business-config/application/municipality-scope';
import { Principal } from '../../identity/domain/principal';
import { Notifier } from '../../notifications/application/notifier';
import { OrderCode } from '../../orders/domain/value-objects/order-code';
import { PreparationSignal } from '../../fulfillment/application/preparation-signal';
import { INCIDENT_TYPES } from '../../fulfillment/domain/incidents';
import { cleanNote, sortBoard } from '../domain/desk';
import { ProofOutcome } from '../domain/operations.codes';
import { OperationsErrors } from '../domain/operations.errors';
import { DeskActions, DeskReader, DeskResult } from '../domain/ports/desk';

/** El rechazo de la base, con el código que la web traduce. */
function refusal(result: Extract<DeskResult, { ok: false }>, step: (status: string) => Error) {
  switch (result.reason) {
    case 'NOT_FOUND':
      return OperationsErrors.orderNotFound();
    case 'REASON':
      return OperationsErrors.cancellationReasonInvalid();
    case 'TYPE':
      return OperationsErrors.incidentTypeInvalid();
    case 'RESOLUTION':
      return OperationsErrors.resolutionInvalid();
    case 'CLOSED':
      return OperationsErrors.incidentClosed(result.status ?? 'RESOLVED');
    default:
      return step(result.status ?? 'UNKNOWN');
  }
}

/**
 * H10.5: el panel de pedidos del operador. Se consulta cada pocos segundos, así que la lista es una sola lectura y
 * las alertas salen de una vista. El personal con alcance solo ve y toca pedidos de su municipio (404 si no).
 */
@Injectable()
export class DeskUseCase {
  constructor(
    private readonly reader: DeskReader,
    private readonly actions: DeskActions,
    private readonly scope: MunicipalityScope,
    private readonly notifier: Notifier,
    private readonly clock: PreparationSignal,
  ) {}

  async board(principal: Principal, municipalityId?: number) {
    const municipality = await this.scope.resolve(principal, municipalityId);
    return { municipality, orders: sortBoard(await this.reader.board(municipality.id, principal.role)) };
  }

  async detail(principal: Principal, rawCode: string) {
    const code = OrderCode.normalize(rawCode);
    const order = code ? await this.reader.detail(code, principal.role) : null;
    if (!order || !this.sees(principal, order.municipalityId)) throw OperationsErrors.orderNotFound();
    return order;
  }

  cancellationReasons() {
    return this.reader.cancellationReasons();
  }

  async cancel(principal: Principal, rawCode: string, input: { reason: string; notes?: string }) {
    const order = await this.inScope(principal, rawCode);
    const notes = cleanNote(input.notes);
    if (!notes) throw OperationsErrors.noteRequired();
    return this.apply(await this.actions.cancel(this.actor(principal), order.code, input.reason, notes), OperationsErrors.notCancellable, order.code);
  }

  async reviewProof(principal: Principal, rawCode: string, input: { outcome: ProofOutcome; notes?: string; incidentType?: string }) {
    const order = await this.inScope(principal, rawCode);
    const notes = cleanNote(input.notes);
    if (!notes) throw OperationsErrors.noteRequired();
    const result = await this.actions.reviewProof(this.actor(principal), order.code, input.outcome, notes, input.incidentType ?? INCIDENT_TYPES.OTHER);
    return this.apply(result, OperationsErrors.proofNotPending, order.code);
  }

  async takeIncident(principal: Principal, incidentId: string) {
    const code = await this.incidentInScope(principal, incidentId);
    return this.apply(await this.actions.takeIncident(this.actor(principal), incidentId), OperationsErrors.incidentClosed, code);
  }

  async resolveIncident(principal: Principal, incidentId: string, input: { resolution: string; notes?: string }) {
    const code = await this.incidentInScope(principal, incidentId);
    const notes = cleanNote(input.notes);
    if (!notes) throw OperationsErrors.noteRequired();
    return this.apply(await this.actions.resolveIncident(this.actor(principal), incidentId, input.resolution, notes), OperationsErrors.incidentClosed, code);
  }

  private actor(principal: Principal) {
    return { userId: principal.userId, role: principal.role };
  }

  private apply(result: DeskResult, step: (status: string) => Error, orderCode: string) {
    if (!result.ok) throw refusal(result, step);
    // Los avisos (cancelado, novedad resuelta) ya están en la bandeja de salida; el cierre automático de la foto cambió.
    this.notifier.kick();
    this.clock.reschedule();
    return { orderCode, status: result.status };
  }

  private sees(principal: Principal, municipalityId: number) {
    return principal.municipalityId === null || principal.municipalityId === municipalityId;
  }

  private async inScope(principal: Principal, rawCode: string) {
    const code = OrderCode.normalize(rawCode);
    const order = code ? await this.reader.orderScope(code) : null;
    if (!order || !this.sees(principal, order.municipalityId)) throw OperationsErrors.orderNotFound();
    return order;
  }

  private async incidentInScope(principal: Principal, incidentId: string) {
    const scope = await this.reader.incidentScope(incidentId);
    if (!scope || !this.sees(principal, scope.municipalityId)) throw OperationsErrors.incidentNotFound();
    return scope.orderCode;
  }
}
