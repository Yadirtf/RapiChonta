import { Prisma } from '@prisma/client';

/** Registro de auditoría (RNF-07) dentro de la transacción del caso de uso. Solo inserción. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: { actorUserId: string | null; action: string; entityTable: string; entityId: string; changes?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_logs (actor_user_id, action_id, entity_table, entity_id, changes)
    SELECT ${entry.actorUserId}::uuid, id, ${entry.entityTable}, ${entry.entityId}, ${entry.changes ?? null}::jsonb
    FROM audit_actions WHERE code = ${entry.action}`;
}
