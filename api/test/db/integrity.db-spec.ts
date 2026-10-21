import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { prismaAdapter } from '../../src/shared/infrastructure/prisma/prisma-adapter';

/**
 * Pruebas de las reglas que garantiza la base de datos (Docs/14-base-de-datos/README.md).
 * Requieren una base migrada y con la semilla: `npm run prisma:deploy && npm run seed:dev && npm run test:db`.
 * Cada prueba corre en una transacción que se revierte al final.
 */
const prisma = new PrismaClient({ adapter: prismaAdapter() });
class Rollback extends Error {}

async function inTransaction(work: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  await prisma
    .$transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

const id = async (tx: Prisma.TransactionClient, table: string, code: string) => {
  const [row] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ${Prisma.raw(table)} WHERE code = ${code}`;
  return row.id;
};

async function newUser(tx: Prisma.TransactionClient, phone = '+573001110000') {
  const person = await tx.person.create({ data: { givenNames: 'Prueba' } });
  await tx.personPhone.create({ data: { personId: person.id, phoneE164: phone, isPrimary: true } });
  const active = await id(tx, 'user_statuses', 'ACTIVE');
  const user = await tx.user.create({ data: { personId: person.id, statusId: active } });
  await tx.userStatusHistory.create({ data: { userId: user.id, toStatusId: active } });
  return { user, person, active };
}

/** Ejecuta en un punto de guardado para poder seguir usando la transacción después del error. */
async function expectDbError(tx: Prisma.TransactionClient, work: () => Promise<unknown>, pattern: RegExp) {
  await tx.$executeRaw`SAVEPOINT expect_error`;
  await expect(work()).rejects.toThrow(pattern);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT expect_error`;
}

afterAll(() => prisma.$disconnect());

describe('Integridad de identidad en PostgreSQL', () => {
  it('el estado de la cuenta solo cambia por el historial y respeta las transiciones', async () => {
    await inTransaction(async (tx) => {
      const { user, active } = await newUser(tx);
      const closed = await id(tx, 'user_statuses', 'CLOSED');
      const suspended = await id(tx, 'user_statuses', 'SUSPENDED');

      await expectDbError(tx, () => tx.user.update({ where: { id: user.id }, data: { statusId: suspended } }), /se cambia insertando en su historial/);

      await tx.userStatusHistory.create({ data: { userId: user.id, fromStatusId: active, toStatusId: closed } });
      expect((await tx.user.findUniqueOrThrow({ where: { id: user.id } })).statusId).toBe(closed);

      // CLOSED es terminal: no hay transición de salida (llave foránea compuesta).
      await expectDbError(tx, () => tx.userStatusHistory.create({ data: { userId: user.id, fromStatusId: closed, toStatusId: active } }), /foreign key|Foreign key/);
      // Un cambio desde un estado que ya no es el actual se rechaza (concurrencia).
      await expectDbError(tx, () => tx.userStatusHistory.create({ data: { userId: user.id, fromStatusId: active, toStatusId: suspended } }), /STATUS_CONFLICT|write conflict/);
    });
  });

  it('el historial es inmutable', async () => {
    await inTransaction(async (tx) => {
      const { user } = await newUser(tx);
      await expectDbError(tx, () => tx.userStatusHistory.updateMany({ where: { userId: user.id }, data: { reason: 'x' } }), /no se editan/);
    });
  });

  it('un usuario no puede tener dos roles COURIER vigentes y COURIER exige municipio', async () => {
    await inTransaction(async (tx) => {
      const { user } = await newUser(tx);
      const courier = await id(tx, 'roles', 'COURIER');
      await expectDbError(tx, () => tx.userRole.create({ data: { userId: user.id, roleId: courier } }), /exige municipio/);
      const [municipality] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM municipalities LIMIT 1`;
      await tx.userRole.create({ data: { userId: user.id, roleId: courier, municipalityId: municipality.id } });
      await expectDbError(
        tx,
        () => tx.userRole.create({ data: { userId: user.id, roleId: courier, municipalityId: municipality.id } }),
        /COURIER vigente|Unique constraint/,
      );
    });
  });

  it('un teléfono fuera de E.164 se rechaza', async () => {
    await inTransaction(async (tx) => {
      const person = await tx.person.create({ data: { givenNames: 'X' } });
      await expectDbError(tx, () => tx.personPhone.create({ data: { personId: person.id, phoneE164: '3001234567', isPrimary: true } }), /phone_e164_check/);
    });
  });

  it('anonymize_person borra los datos personales, cierra sesiones y deja la cuenta en CLOSED', async () => {
    await inTransaction(async (tx) => {
      const { user, person } = await newUser(tx, '+573001119999');
      const customer = await id(tx, 'roles', 'CUSTOMER');
      const session = await tx.session.create({ data: { userId: user.id, activeRoleId: customer } });
      await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 1e9) } });

      await tx.$executeRaw`SELECT anonymize_person(${person.id}::uuid, ${user.id}::uuid)`;

      const after = await tx.person.findUniqueOrThrow({ where: { id: person.id }, include: { phones: true } });
      expect(after).toMatchObject({ givenNames: 'Anónimo', familyNames: null, phones: [] });
      expect(after.anonymizedAt).not.toBeNull();
      expect((await tx.session.findUniqueOrThrow({ where: { id: session.id } })).endedAt).not.toBeNull();
      const status = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { status: true } });
      expect(status.status.code).toBe('CLOSED');
    });
  });
});
