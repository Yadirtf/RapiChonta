import { AlertMark, cleanNote, mergeTimeline, sortAlerts, sortBoard } from './desk';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 23, 12, minute));

describe('Panel de pedidos (H10.5)', () => {
  it('ordena por la alerta más urgente; a igual alerta, la más vieja; sin alertas al final', () => {
    const orders: { code: string; createdAt: Date; alerts: AlertMark[] }[] = [
      { code: 'quieto', createdAt: at(0), alerts: [] },
      { code: 'sin-asignar', createdAt: at(1), alerts: [{ code: 'UNASSIGNED', since: at(1) }] },
      { code: 'foto-nueva', createdAt: at(2), alerts: [{ code: 'PROOF_REVIEW', since: at(30) }] },
      { code: 'novedad', createdAt: at(3), alerts: [{ code: 'COLLECTION_MISSING', since: at(2) }, { code: 'INCIDENT', since: at(40) }] },
      { code: 'foto-vieja', createdAt: at(4), alerts: [{ code: 'PROOF_REVIEW', since: at(10) }] },
    ];
    expect(sortBoard(orders).map((o) => o.code)).toEqual(['novedad', 'foto-vieja', 'foto-nueva', 'sin-asignar', 'quieto']);
    expect(sortAlerts(orders[3].alerts).map((a) => a.code)).toEqual(['INCIDENT', 'COLLECTION_MISSING']);
  });

  it('el comentario es obligatorio y se limpia', () => {
    expect(cleanNote('  ok ')).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote('  Llamé al cliente,\n  sí lo recibió  ')).toBe('Llamé al cliente, sí lo recibió');
    expect(cleanNote('x'.repeat(400))).toHaveLength(300);
  });

  it('une la línea de tiempo por hora; en el mismo instante manda `seq` y después el orden de cada fuente', () => {
    const merged = mergeTimeline(
      [{ kind: 'INCIDENT', at: at(5), seq: 1 }],
      [
        { kind: 'STATUS', at: at(1) },
        { kind: 'STATUS', at: at(5), seq: 2 },
      ],
      [{ kind: 'COLLECTION', at: at(3) }],
    );
    expect(merged.map((e) => `${e.kind}@${e.at.getUTCMinutes()}`)).toEqual(['STATUS@1', 'COLLECTION@3', 'INCIDENT@5', 'STATUS@5']);
  });
});
