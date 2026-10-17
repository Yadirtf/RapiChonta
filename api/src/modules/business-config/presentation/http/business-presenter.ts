import { DisplayRate } from '../../application/exchange-rates.use-cases';
import { ScheduleView } from '../../application/schedule.use-cases';
import { MunicipalityInfo } from '../../domain/ports/municipalities';
import { CommissionVersion } from '../../domain/ports/settings.repository';
import { ZoneRecord } from '../../domain/ports/zones.repository';
import { CommissionPercent } from '../../domain/value-objects/business-values';
import { OpeningState } from '../../domain/value-objects/opening-calendar';

/** Respuestas HTTP del módulo: fechas ISO, dinero como texto decimal y franjas "HH:MM". */
export const BusinessPresenter = {
  municipality: (m: MunicipalityInfo) => ({ id: m.id, name: m.name, timeZone: m.timeZone, center: m.center }),

  zone: (z: ZoneRecord) => ({
    id: z.id,
    name: z.name,
    kind: z.kind,
    area: z.area,
    areaSquareMeters: z.areaSquareMeters,
    fee: z.fee,
    feeSince: z.feeSince,
    sortOrder: z.sortOrder,
  }),

  state: (s: OpeningState) => ({ open: s.open, closesAt: s.closesAt?.toISOString() ?? null, nextOpeningAt: s.nextOpeningAt?.toISOString() ?? null }),

  schedule(view: ScheduleView) {
    return {
      municipality: BusinessPresenter.municipality(view.municipality),
      weekly: view.weekly.map((d) => ({ weekday: d.weekday, slots: d.slots.map((s) => s.toJSON()) })),
      exceptions: view.exceptions.map((e) => ({ date: e.date, closed: !e.slots.length, slots: e.slots.map((s) => s.toJSON()), reason: e.reason })),
      status: BusinessPresenter.state(view.state),
    };
  },

  commission: (c: CommissionVersion) => ({ percent: CommissionPercent.fromRate(c.rate).toPercentString(), since: c.createdAt, by: c.createdBy }),

  rate: (r: DisplayRate) => ({ currency: r.currency, copPerUnit: r.copPerUnit, fetchedAt: r.fetchedAt, isToday: r.isToday }),
};
