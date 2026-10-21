"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, LocateFixed, PenLine, Percent, Power, Radar, Store, Trash2, Undo2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { can, PERMISSIONS } from "@/core/domain/entities/account";
import { READINESS_ITEMS, type MunicipalityOverview, type ReadinessItem, type ZoneShape } from "@/core/domain/entities/business";
import type { LngLat } from "@/core/domain/entities/catalog-admin";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { parsePriceInput } from "@/core/domain/entities/money";
import { circleRing, squareMeters, zoneProblem } from "@/core/domain/entities/zone-geometry";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/Field";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { usePanelMunicipality } from "../PanelMunicipality";
import { ZonesMap, type ZoneMapMode } from "../zones/ZonesMap";

interface Draft {
  shape: ZoneShape;
  center: GeoPoint;
  radiusMeters: number;
  ring: LngLat[];
  fee: string;
}

/** Atajos del radio: del casco urbano a las veredas cercanas. */
const RADIUS_PRESETS = [1_000, 2_000, 3_000, 5_000, 8_000];
const READINESS_ICON: Record<ReadinessItem, typeof Radar> = { coverage: Radar, hours: Clock, commission: Percent };
const READINESS_HREF: Record<ReadinessItem, string> = { coverage: "/panel/cobertura", hours: "/panel/horario", commission: "/panel/configuracion" };

/** "850 m", "3 km", "2,5 km". */
function useDistanceFormat() {
  const format = useFormatter();
  return useCallback(
    (meters: number) => (meters < 1_000 ? `${format.number(Math.round(meters / 10) * 10)} m` : `${format.number(meters / 1_000, { maximumFractionDigits: 1 })} km`),
    [format],
  );
}

/**
 * Cobertura por municipio (H03.5): hasta dónde llegan los domiciliarios, como radio alrededor de la plaza o
 * como área dibujada, con una tarifa base para todo lo que no sea un barrio o vereda con tarifa propia.
 * Cada municipio es una placa de moto: amarilla si ya está abierto, punteada si está en preparación.
 */
export function CoverageView() {
  const t = useTranslations("coverage");
  const money = useCatalogFormat();
  const distance = useDistanceFormat();
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { account } = useAuth();
  const { current, select, refresh } = usePanelMunicipality();
  const options = useResource(() => container.businessAdmin.options(), []);
  const overview = useResource(() => container.businessAdmin.coverage(), []);
  const municipalityId = current?.id;
  const feeZones = useResource(() => (municipalityId ? container.businessAdmin.zones(municipalityId) : Promise.resolve(null)), [municipalityId]);

  const list = useMemo(() => overview.data ?? [], [overview.data]);
  const selected = list.find((o) => o.municipality.id === municipalityId) ?? null;
  const limits = options.data?.limits;
  const canLaunch = can(account, PERMISSIONS.MANAGE_MUNICIPALITIES) && list.length > 1;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<ZoneMapMode>("view");
  const [history, setHistory] = useState<LngLat[][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<"remove" | "pause" | null>(null);

  const startEditing = (item: MunicipalityOverview) => {
    const c = item.coverage;
    setDraft({
      shape: c?.shape ?? "CIRCLE",
      center: c?.circle?.center ?? item.municipality.center,
      radiusMeters: c?.circle?.radiusMeters ?? 3_000,
      ring: c?.shape === "POLYGON" ? c.area : [],
      fee: c ? String(Number(c.fee)) : "",
    });
    setHistory([]);
    setMode(c?.shape === "POLYGON" ? "edit" : "probe");
    setError(null);
  };

  const close = () => {
    setDraft(null);
    setMode("view");
    setError(null);
  };

  const choose = (id: number) => {
    if (id === municipalityId) return;
    close();
    select(id);
  };

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const changeRing = useCallback((ring: LngLat[]) => {
    const d = draftRef.current;
    if (!d) return;
    setHistory((h) => [...h.slice(-49), d.ring]);
    setDraft({ ...d, ring });
  }, []);

  const setShape = (shape: ZoneShape) => {
    if (!draft || draft.shape === shape) return;
    // Pasar de radio a área arranca con el círculo como borde editable: se ajusta en vez de dibujar de cero.
    const ring = shape === "POLYGON" && draft.ring.length < 3 ? circleRing(draft.center, draft.radiusMeters, 24) : draft.ring;
    setDraft({ ...draft, shape, ring });
    setMode(shape === "CIRCLE" ? "probe" : "edit");
  };

  const ring = draft ? (draft.shape === "CIRCLE" ? circleRing(draft.center, draft.radiusMeters) : draft.ring) : null;
  const fee = draft ? parsePriceInput(draft.fee) : null;
  const problem = draft?.shape === "POLYGON" && limits ? zoneProblem(draft.ring, limits.coverage) : null;
  const canSave = !!draft && !!fee && Number(fee) > 0 && !problem && mode !== "draw";

  const reloadAll = async () => {
    await Promise.all([overview.reload(), feeZones.reload(), refresh()]);
  };

  const save = async () => {
    if (!draft || !fee || !municipalityId) return;
    setSaving(true);
    setError(null);
    try {
      const input =
        draft.shape === "CIRCLE"
          ? { shape: "CIRCLE" as const, center: draft.center, radiusMeters: draft.radiusMeters, fee }
          : { shape: "POLYGON" as const, area: draft.ring, fee };
      await container.businessAdmin.saveCoverage(input, municipalityId);
      await reloadAll();
      close();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!municipalityId) return;
    setSaving(true);
    try {
      await container.businessAdmin.removeCoverage(municipalityId);
      await reloadAll();
      setConfirm(null);
      close();
    } catch (e) {
      setError(e);
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const setLaunched = async (launched: boolean) => {
    if (!municipalityId) return;
    setSaving(true);
    setError(null);
    try {
      await container.businessAdmin.updateMunicipality(municipalityId, { launched });
      await reloadAll();
      setConfirm(null);
    } catch (e) {
      setError(e);
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const summary = (item: MunicipalityOverview) => {
    const c = item.coverage;
    if (!c) return t("noCoverage");
    return c.circle ? t("summaryRadius", { radius: distance(c.circle.radiusMeters) }) : t("summaryArea", { area: format.number(c.areaSquareMeters / 1_000_000, { maximumFractionDigits: 1 }) });
  };

  const opened = list.filter((o) => o.municipality.launched).length;
  const mapCenter = selected?.municipality.center ?? { lat: 1.0294, lng: -76.6165 };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("title")} subtitle={list.length ? t("subtitle", { open: opened, total: list.length }) : undefined} />

      {overview.error ? <Alert>{errorMessage(overview.error)}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          {overview.loading && !overview.data
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-white" />)
            : list.map((item) => {
                const active = item.municipality.id === municipalityId;
                const missing = READINESS_ITEMS.filter((k) => !item.readiness[k]);
                return (
                  <section key={item.municipality.id} className={`rounded-[28px] bg-white shadow-sm ring-1 transition ${active ? "ring-2 ring-ink" : "ring-ink/5"}`}>
                    <button onClick={() => choose(item.municipality.id)} aria-pressed={active} className="flex w-full items-center gap-3 p-4 text-left sm:gap-4">
                      <span className={`moto-plate ${item.municipality.launched ? "" : "is-preparing"}`}>
                        <b>{item.municipality.name}</b>
                        <small>{item.municipality.department}</small>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider ${item.municipality.launched ? "text-leaf" : "text-ink/45"}`}>
                          <span className={`size-2 shrink-0 rounded-full ${item.municipality.launched ? "bg-leaf" : "bg-ink/25"}`} aria-hidden />
                          {item.municipality.launched ? t("statusOpen") : t("statusPreparing")}
                          {!item.municipality.launched && (
                            <span className="tabular-nums text-ink/35" title={t("readinessTitle")}>
                              · {READINESS_ITEMS.length - missing.length}/{READINESS_ITEMS.length}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-semibold text-ink/75">{summary(item)}</span>
                        {item.coverage && <span className="block text-xs text-ink/50">{t("baseFee", { fee: money.price(item.coverage.fee) })}</span>}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="flex flex-col gap-4 border-t border-dashed border-ink/10 p-4">
                            {draft ? (
                              <Editor
                                draft={draft}
                                limits={limits}
                                problem={problem}
                                fee={fee}
                                mode={mode}
                                historyLength={history.length}
                                onChange={(patch) => setDraft({ ...draft, ...patch })}
                                onShape={setShape}
                                onDraw={() => {
                                  changeRing([]);
                                  setMode("draw");
                                }}
                                onAdjust={() => setMode("edit")}
                                onUndo={() => {
                                  const previous = history[history.length - 1];
                                  if (!previous) return;
                                  setHistory((h) => h.slice(0, -1));
                                  setDraft({ ...draft, ring: previous });
                                }}
                                onResetCenter={() => setDraft({ ...draft, center: item.municipality.center })}
                                distance={distance}
                                areaKm2={ring && ring.length >= 3 ? squareMeters(ring) / 1_000_000 : 0}
                              />
                            ) : (
                              <Readiness item={item} onGo={() => select(item.municipality.id)} />
                            )}

                            {error ? <Alert>{errorMessage(error)}</Alert> : null}

                            {draft ? (
                              <div className="flex flex-col gap-2">
                                <Button size="lg" block disabled={!canSave} loading={saving} onClick={() => void save()}>
                                  {t("save")}
                                </Button>
                                <div className="flex gap-2">
                                  <Button variant="ghost" block onClick={close}>
                                    {t("cancel")}
                                  </Button>
                                  {item.coverage && (
                                    <Button variant="ghost" className="text-red-600" onClick={() => setConfirm("remove")} aria-label={t("remove")} title={t("remove")}>
                                      <Trash2 className="size-4" aria-hidden />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Button variant={item.coverage ? "outline" : "primary"} block onClick={() => startEditing(item)}>
                                  <Radar className="size-4" aria-hidden /> {item.coverage ? t("editCoverage") : t("defineCoverage")}
                                </Button>
                                {canLaunch &&
                                  (item.municipality.launched ? (
                                    <Button variant="ghost" block onClick={() => setConfirm("pause")}>
                                      <Power className="size-4" aria-hidden /> {t("pause", { name: item.municipality.name })}
                                    </Button>
                                  ) : (
                                    <Button variant="dark" block disabled={missing.length > 0} loading={saving} onClick={() => void setLaunched(true)}>
                                      <Power className="size-4 text-brand" aria-hidden /> {t("launch", { name: item.municipality.name })}
                                    </Button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
        </div>

        <div className="relative order-1 h-[58dvh] min-h-[420px] overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5 lg:sticky lg:top-6 lg:order-2 lg:h-[calc(100dvh-12rem)]">
          <ZonesMap
            key={municipalityId ?? 0}
            fallbackCenter={mapCenter}
            zones={feeZones.data?.zones ?? []}
            coverage={draft ? null : (selected?.coverage ?? null)}
            selectedId={null}
            editingId={null}
            draft={ring}
            mode={draft ? mode : "view"}
            conflicts={[]}
            preview={null}
            probe={draft?.shape === "CIRCLE" ? draft.center : null}
            maxVertices={limits?.coverage.maxVertices ?? 300}
            formatFee={money.price}
            onSelect={() => {}}
            onDraftChange={changeRing}
            onCloseRing={() => setMode("edit")}
            onProbe={(center) => draft && setDraft({ ...draft, center })}
            labels={{ vertexHint: t("vertexHint"), midpointHint: t("midpointHint") }}
          />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
            <p className="flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-xs font-semibold text-ink/75 shadow-lg backdrop-blur">
              <span className="h-0 w-6 border-t-[3px] border-dashed border-chonta-strong" aria-hidden />
              {draft ? (draft.shape === "CIRCLE" ? t("mapHintCircle") : mode === "draw" ? t("mapHintDraw") : t("mapHintEdit")) : t("mapLegend")}
            </p>
          </div>
          {selected && !draft && !selected.coverage && (
            <div className="absolute inset-x-3 bottom-3 rounded-3xl bg-ink p-4 text-white shadow-2xl sm:left-auto sm:w-80">
              <p className="font-display text-lg font-extrabold">{t("emptyTitle", { name: selected.municipality.name })}</p>
              <p className="mt-1 text-sm text-white/75">{t("emptyBody")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "pause" ? t("pauseTitle", { name: current?.name ?? "" }) : t("removeTitle")}
        description={confirm === "pause" ? t("pauseBody") : t("removeBody", { name: current?.name ?? "" })}
        closeLabel={t("cancel")}
      >
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="danger" block loading={saving} onClick={() => void (confirm === "pause" ? setLaunched(false) : remove())}>
            {confirm === "pause" ? t("pauseConfirm") : t("remove")}
          </Button>
          <Button variant="ghost" block onClick={() => setConfirm(null)}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

interface EditorProps {
  draft: Draft;
  limits: { radius: { minMeters: number; maxMeters: number } } | undefined;
  problem: string | null;
  fee: string | null;
  mode: ZoneMapMode;
  historyLength: number;
  areaKm2: number;
  distance: (meters: number) => string;
  onChange: (patch: Partial<Draft>) => void;
  onShape: (shape: ZoneShape) => void;
  onDraw: () => void;
  onAdjust: () => void;
  onUndo: () => void;
  onResetCenter: () => void;
}

function Editor({ draft, limits, problem, fee, mode, historyLength, areaKm2, distance, onChange, onShape, onDraw, onAdjust, onUndo, onResetCenter }: EditorProps) {
  const t = useTranslations("coverage");
  const tz = useTranslations("zones");
  const money = useCatalogFormat();
  const format = useFormatter();
  const min = limits?.radius.minMeters ?? 200;
  const max = limits?.radius.maxMeters ?? 15_000;
  const fill = `${((draft.radiusMeters - min) / (max - min)) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t("shape")} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
        {(["CIRCLE", "POLYGON"] as const).map((shape) => {
          const Icon = shape === "CIRCLE" ? Radar : PenLine;
          const active = draft.shape === shape;
          return (
            <button
              key={shape}
              role="radio"
              aria-checked={active}
              onClick={() => onShape(shape)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-ink text-brand shadow" : "text-ink/60 hover:text-ink"}`}
            >
              <Icon className="size-4" aria-hidden /> {t(`shapes.${shape}`)}
            </button>
          );
        })}
      </div>

      {draft.shape === "CIRCLE" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink/45">{t("radius")}</p>
              <p className="font-display text-4xl font-extrabold tabular-nums tracking-tight">{distance(draft.radiusMeters)}</p>
            </div>
            <p className="pb-1.5 text-right text-xs text-ink/55">{t("areaApprox", { area: format.number(areaKm2, { maximumFractionDigits: 1 }) })}</p>
          </div>
          <input
            type="range"
            className="radius-road"
            style={{ ["--fill" as string]: fill }}
            min={min}
            max={max}
            step={50}
            value={draft.radiusMeters}
            aria-label={t("radius")}
            aria-valuetext={distance(draft.radiusMeters)}
            onChange={(e) => onChange({ radiusMeters: Number(e.target.value) })}
          />
          <div className="flex flex-wrap gap-1.5">
            {RADIUS_PRESETS.filter((r) => r >= min && r <= max).map((r) => (
              <button
                key={r}
                onClick={() => onChange({ radiusMeters: r })}
                aria-pressed={draft.radiusMeters === r}
                className={`rounded-full px-3 py-1 text-xs font-bold ring-1 transition ${draft.radiusMeters === r ? "bg-brand ring-ink" : "ring-ink/15 hover:bg-cream"}`}
              >
                {distance(r)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2.5">
            <p className="text-xs text-ink/60">{t("centerHint")}</p>
            <button onClick={onResetCenter} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold text-chonta-strong hover:bg-white">
              <LocateFixed className="size-3.5" aria-hidden /> {t("centerReset")}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={mode === "draw" ? "dark" : "outline"} onClick={onDraw}>
              <PenLine className="size-4" aria-hidden /> {tz("redraw")}
            </Button>
            <Button size="sm" variant={mode === "edit" ? "dark" : "outline"} disabled={draft.ring.length < 3} onClick={onAdjust}>
              {tz("adjust")}
            </Button>
            <button onClick={onUndo} disabled={!historyLength} className="ml-auto grid size-9 place-items-center rounded-xl text-ink/60 hover:bg-ink/5 disabled:opacity-30" aria-label={tz("undo")} title={tz("undo")}>
              <Undo2 className="size-4.5" aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/60">{mode === "draw" ? tz("hintDraw") : tz("hintEdit")}</p>
          {mode === "draw" && draft.ring.length >= 3 && (
            <Button size="sm" variant="dark" className="mt-2" onClick={onAdjust}>
              {tz("finish")}
            </Button>
          )}
          {problem && draft.ring.length > 0 && <p className="mt-2 text-xs font-semibold text-chonta-strong">{t(`problems.${problem}`)}</p>}
        </div>
      )}

      <div className="flex items-end gap-3">
        <TextField
          label={t("fee")}
          inputMode="decimal"
          value={draft.fee}
          placeholder="4.000"
          containerClassName="flex-1"
          error={draft.fee && !fee ? tz("feeInvalid") : null}
          hint={t("feeHint")}
          onChange={(e) => onChange({ fee: e.target.value })}
        />
        {fee && <span className="price-tag mb-7 shrink-0 text-lg">{money.price(fee)}</span>}
      </div>
    </div>
  );
}

/** Lo que le falta al municipio para abrir, con un atajo a cada página (que ya queda en este municipio). */
function Readiness({ item, onGo }: { item: MunicipalityOverview; onGo: () => void }) {
  const t = useTranslations("coverage");
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink/45">
        <Store className="size-3.5" aria-hidden /> {item.municipality.launched ? t("readinessOpen", { zones: item.zoneCount }) : t("readinessTitle")}
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {READINESS_ITEMS.map((key) => {
          const Icon = READINESS_ICON[key];
          const ok = item.readiness[key];
          return (
            <li key={key}>
              <Link
                href={READINESS_HREF[key]}
                onClick={onGo}
                className={`flex h-full flex-col items-start gap-1.5 rounded-2xl p-2.5 text-left ring-1 transition hover:-translate-y-px ${ok ? "bg-leaf/10 ring-leaf/25" : "bg-chonta-soft/60 ring-chonta/25"}`}
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className={`size-4 ${ok ? "text-leaf" : "text-chonta-strong"}`} aria-hidden />
                  {ok ? <Check className="size-4 text-leaf" aria-label={t("ready")} /> : <X className="size-4 text-chonta-strong" aria-label={t("missing")} />}
                </span>
                <span className="text-xs font-bold">{t(`readiness.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
