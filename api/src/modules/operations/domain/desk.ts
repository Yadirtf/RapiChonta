import { DESK_ALERTS, DeskAlert, MAX_NOTE_LENGTH, MIN_NOTE_LENGTH } from './operations.codes';

export interface AlertMark {
  code: DeskAlert;
  since: Date;
}

const rank = (code: DeskAlert) => DESK_ALERTS.indexOf(code);

/** Las alertas de un pedido, de la más urgente a la menos. */
export function sortAlerts<T extends AlertMark>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => rank(a.code) - rank(b.code) || a.since.getTime() - b.since.getTime());
}

/**
 * El orden del panel: primero lo que tiene la alerta más urgente; a igual alerta, lo que lleva más tiempo con ella.
 * Lo que no tiene alertas va al final, del más viejo al más nuevo.
 */
export function sortBoard<T extends { createdAt: Date; alerts: readonly AlertMark[] }>(orders: readonly T[]): T[] {
  const top = (o: T) => sortAlerts(o.alerts)[0];
  return [...orders].sort((a, b) => {
    const x = top(a);
    const y = top(b);
    if (x && y) return rank(x.code) - rank(y.code) || x.since.getTime() - y.since.getTime();
    if (x || y) return x ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** El comentario del operador, limpio; nulo si no alcanza (lo que hizo y por qué debe quedar escrito). */
export function cleanNote(note: string | null | undefined): string | null {
  const text = (note ?? '').replace(/\s+/g, ' ').trim();
  return text.length >= MIN_NOTE_LENGTH ? text.slice(0, MAX_NOTE_LENGTH) : null;
}

/** Un evento de la línea de tiempo; `at` ordena y `seq` desempata dos cosas que pasaron en el mismo instante. */
export interface TimelineEntry {
  at: Date;
  kind: string;
  seq?: number;
}

/** Une los eventos de cada tabla en una sola línea, del más viejo al más nuevo, sin perder el orden de cada fuente. */
export function mergeTimeline<T extends TimelineEntry>(...sources: readonly (readonly T[])[]): T[] {
  return sources
    .flatMap((source, s) => source.map((entry, i) => ({ entry, key: s * 100_000 + i })))
    .sort((a, b) => a.entry.at.getTime() - b.entry.at.getTime() || (a.entry.seq ?? 0) - (b.entry.seq ?? 0) || a.key - b.key)
    .map((x) => x.entry);
}
