import { Injectable } from '@nestjs/common';
import { Principal } from '../../../domain/principal';
import { LegalDocumentVersion, LegalRepository } from '../../../domain/ports/legal.repository';

/** RF-07: aceptar los documentos legales vigentes pendientes (p. ej. tras publicarse una versión nueva). */
@Injectable()
export class AcceptConsentsUseCase {
  constructor(private readonly legal: LegalRepository) {}

  async execute(principal: Principal, versionIds: string[], ipAddress?: string): Promise<LegalDocumentVersion[]> {
    const pending = await this.legal.pendingFor(principal.userId);
    const accepted = pending.filter((doc) => versionIds.includes(doc.id)).map((doc) => doc.id);
    if (accepted.length) await this.legal.accept(principal.userId, accepted, ipAddress);
    return this.legal.pendingFor(principal.userId);
  }
}
