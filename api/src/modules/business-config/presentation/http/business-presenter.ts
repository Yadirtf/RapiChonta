import { DisplayRate } from '../../application/exchange-rates.use-cases';
import { ScheduleView } from '../../application/schedule.use-cases';
import { MunicipalityOverview } from '../../application/coverage.use-cases';
import { MunicipalityInfo } from '../../domain/ports/municipalities';
import { CommissionVersion } from '../../domain/ports/settings.repository';
import { ZoneRecord } from '../../domain/ports/zones.repository';
import { CommissionPercent } from '../../domain/value-objects/business-values';
import { OpeningState } from '../../domain/value-objects/opening-calendar';

/** Respuestas HTTP del módulo: fechas ISO, dinero como texto decimal y franjas "HH:MM". */
export const BusinessPresenter = {
  municipality: (m: MunicipalityInfo) => ({ id: m.id, name: m.name, department: m.department, timeZone: m.timeZone, center: m.center, launched: m.launched }),

  overview: (o: MunicipalityOverview) => ({
    municipality: BusinessPresenter.municipality(o.municipality),
    coverage: o.coverage && BusinessPresenter.zone(o.coverage),
    zoneCount: o.zoneCount,
    readiness: o.readiness,
  }),

  zone: (z: ZoneRecord) => ({
    id: z.id,
    name: z.name,
    kind: z.kind,
    shape: z.shape,
    circle: z.circle,
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
