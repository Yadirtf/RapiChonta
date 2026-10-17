"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, History, Home, MapPinned, PenLine, Plus, Scissors, Trash2, Trees, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Zone, ZoneKind, ZoneOverlap } from "@/core/domain/entities/business";
import type { LngLat } from "@/core/domain/entities/catalog-admin";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { parsePriceInput } from "@/core/domain/entities/money";
import { squareMeters, zoneAt, zoneProblem } from "@/core/domain/entities/zone-geometry";
import { container } from "@/infrastructure/di/container";
import { ApiError } from "@/infrastructure/http/api-client";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/Field";
import { useCatalogFormat } from "../../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { ZonesMap, type ZoneMapMode } from "./ZonesMap";

interface Draft {
  id: string | null;
  name: string;
  kind: ZoneKind;
  fee: string;
  ring: LngLat[];
}

const KIND_ICON = { URBAN: Home, RURAL: Trees } as const;

/** Superficie legible: m² para una manzana, hectáreas para un barrio, km² para un grupo de veredas. */
function useAreaFormat() {
  const format = useFormatter();
  return useCallback(
    (m2: number) =>
      m2 < 10_000
        ? `${format.number(Math.round(m2))} m²`
        : m2 < 1_000_000
          ? `${format.number(m2 / 10_000, { maximumFractionDigits: 1 })} ha`
          : `${format.number(m2 / 1_000_000, { maximumFractionDigits: 2 })} km²`,
    [format],
  );
}

/**
 * Zonas de entrega con tarifa fija (H03.1): barrios del casco urbano y veredas, dibujados en el mapa.
 * Al guardar, si la zona pisa otra se marcan en rojo las que chocan y se ofrece recortarla automáticamente.
 */
export function ZonesView() {
  const t = useTranslations("zones");
  const money = useCatalogFormat();
  const area = useAreaFormat();
  const errorMessage = useErrorMessage();
  const options = useResource(() => container.businessAdmin.options(), []);
  const { data, error, loading, reload } = useResource(() => container.businessAdmin.zones(), []);
  const zones = useMemo(() => data?.zones ?? [], [data]);
  const limits = options.data?.limits.zone;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<LngLat[][]>([]);
  const [mode, setMode] = useState<ZoneMapMode>("view");
  const [overlaps, setOverlaps] = useState<ZoneOverlap[]>([]);
  const [preview, setPreview] = useState<LngLat[] | null>(null);
  const [probe, setProbe] = useState<GeoPoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [feesOf, setFeesOf] = useState<Zone | null>(null);

  const startNew = () => {
    setSelectedId(null);
    setDraft({ id: null, name: "", kind: "URBAN", fee: "", ring: [] });
    setHistory([]);
    setMode("draw");
    resetFeedback();
  };

  const edit = (zone: Zone) => {
    setSelectedId(zone.id);
    setDraft({ id: zone.id, name: zone.name, kind: zone.kind, fee: String(Number(zone.fee)), ring: zone.area });
    setHistory([]);
    setMode("edit");
    resetFeedback();
  };

  const close = () => {
    setDraft(null);
    setMode("view");
    resetFeedback();
  };

  function resetFeedback() {
    setOverlaps([]);
    setPreview(null);
    setSaveError(null);
  }

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const changeRing = useCallback((ring: LngLat[]) => {
    const current = draftRef.current;
    if (!current) return;
    setHistory((h) => [...h.slice(-49), current.ring]);
    setDraft({ ...current, ring });
    setPreview(null);
    setOverlaps([]);
  }, []);

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous || !draft) return;
    setHistory((h) => h.slice(0, -1));
    setDraft({ ...draft, ring: previous });
  };

  const fee = draft ? parsePriceInput(draft.fee) : null;
  const problem = draft && limits ? zoneProblem(draft.ring, limits) : null;
  const canSave = !!draft && draft.name.trim().length >= 2 && !!fee && Number(fee) > 0 && !problem && mode !== "draw";

  const save = async (trimOverlaps = false) => {
    if (!draft || !fee) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input = { name: draft.name, kind: draft.kind, fee, area: draft.ring, trimOverlaps };
      const saved = draft.id ? await container.businessAdmin.updateZone(draft.id, input) : await container.businessAdmin.createZone(input);
      await reload();
      setSelectedId(saved.id);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.code === "ZONE_OVERLAP") setOverlaps((e.details?.zones as ZoneOverlap[]) ?? []);
      else setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const showTrim = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      setPreview(await container.businessAdmin.trimZone(draft.ring, draft.id ?? undefined));
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      await container.businessAdmin.deactivateZone(draft.id);
      setConfirmRemove(false);
      setSelectedId(null);
      close();
      await reload();
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const probeZone = probe ? zoneAt(zones, probe) : null;
  const mapLabels = useMemo(() => ({ vertexHint: t("vertexHint"), midpointHint: t("midpointHint") }), [t]);
  const center = data?.municipality.center ?? options.data?.municipalities[0]?.center ?? { lat: 1.0294, lng: -76.6165 };
  const grouped = (["URBAN", "RURAL"] as const).map((kind) => ({ kind, zones: zones.filter((z) => z.kind === kind) }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t("title")}
        subtitle={data ? t("subtitle", { municipality: data.municipality.name }) : undefined}
        action={
          !draft && (
            <Button onClick={startNew} disabled={!limits}>
              <Plus className="size-4" aria-hidden /> {t("new")}
            </Button>
          )
        }
      />

      {error ? <Alert>{errorMessage(error)}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Columna: lista o editor */}
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <AnimatePresence mode="wait" initial={false}>
            {draft ? (
              <motion.section
                key="editor"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="flex flex-col gap-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/5"
                aria-label={draft.id ? t("editTitle") : t("newTitle")}
              >
                <div>
                  <h2 className="font-display text-xl font-extrabold tracking-tight">{draft.id ? t("editTitle") : t("newTitle")}</h2>
                  <p className="mt-0.5 text-sm text-ink/55">{t("editorHint")}</p>
                </div>

                <div role="radiogroup" aria-label={t("kind")} className="grid grid-cols-2 gap-2">
                  {(["URBAN", "RURAL"] as const).map((kind) => {
                    const Icon = KIND_ICON[kind];
                    const active = draft.kind === kind;
                    return (
                      <button
                        key={kind}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDraft({ ...draft, kind })}
                        className={`flex flex-col items-start gap-1.5 rounded-2xl p-3 text-left ring-1 transition ${
                          active ? (kind === "URBAN" ? "bg-brand/25 ring-2 ring-chonta-strong" : "bg-leaf/10 ring-2 ring-leaf") : "ring-ink/10 hover:bg-ink/[0.03]"
                        }`}
                      >
                        <Icon className={`size-5 ${kind === "URBAN" ? "text-chonta-strong" : "text-leaf"}`} aria-hidden />
                        <span className="text-sm font-bold">{t(`kinds.${kind}`)}</span>
                        <span className="text-xs text-ink/55">{t(`kindHints.${kind}`)}</span>
                      </button>
                    );
                  })}
                </div>

                <TextField label={t("name")} value={draft.name} maxLength={80} placeholder={t(`namePlaceholder.${draft.kind}`)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

                <div className="flex items-end gap-3">
                  <TextField
                    label={t("fee")}
                    inputMode="decimal"
                    value={draft.fee}
                    placeholder="3.000"
                    containerClassName="flex-1"
                    error={draft.fee && !fee ? t("feeInvalid") : null}
                    hint={t("feeHint")}
                    onChange={(e) => setDraft({ ...draft, fee: e.target.value })}
                  />
                  {fee && <span className="price-tag mb-7 shrink-0 text-lg">{money.price(fee)}</span>}
                </div>

                <div className="rounded-2xl bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ToolButton active={mode === "draw"} onClick={() => (mode === "draw" ? undefined : (changeRing([]), setMode("draw")))} icon={<PenLine className="size-4" />} label={draft.ring.length ? t("redraw") : t("draw")} />
                    <ToolButton active={mode === "edit"} disabled={draft.ring.length < 3} onClick={() => setMode("edit")} icon={<MapPinned className="size-4" />} label={t("adjust")} />
                    <button onClick={undo} disabled={!history.length} className="ml-auto grid size-9 place-items-center rounded-xl text-ink/60 hover:bg-ink/5 disabled:opacity-30" aria-label={t("undo")} title={t("undo")}>
                      <Undo2 className="size-4.5" aria-hidden />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-ink/60">{mode === "draw" ? t("hintDraw") : t("hintEdit")}</p>
                  {mode === "draw" && draft.ring.length >= 3 && (
                    <Button size="sm" variant="dark" className="mt-2" onClick={() => setMode("edit")}>
                      {t("finish")}
                    </Button>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
                    <span className="text-ink/55">{t("vertices", { count: draft.ring.length })}</span>
                    <span className={`font-semibold ${problem && problem !== "TOO_FEW_VERTICES" ? "text-red-600" : "text-ink"}`} role="status">
                      {problem ? t(`problems.${problem}`, { min: area(limits?.minSquareMeters ?? 0), max: area(limits?.maxSquareMeters ?? 0) }) : area(squareMeters(draft.ring))}
                    </span>
                  </div>
                </div>

                {overlaps.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-2xl bg-chonta-soft p-4 ring-1 ring-chonta/30" role="alert">
                    <p className="text-sm font-bold text-chonta-strong">{t("overlapTitle")}</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {overlaps.map((o) => (
                        <li key={o.id} className="flex justify-between gap-3">
                          <span className="font-semibold">{o.name}</span>
                          <span className="tabular-nums text-ink/60">{area(o.overlapSquareMeters)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-ink/65">{t("overlapBody")}</p>
                    {preview ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold text-leaf">{t("trimPreview", { area: area(squareMeters(preview)) })}</p>
                        <Button size="sm" variant="dark" loading={saving} onClick={() => void save(true)}>
                          <Scissors className="size-4" aria-hidden /> {t("trimSave")}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" loading={saving} onClick={() => void showTrim()}>
                        <Scissors className="size-4" aria-hidden /> {t("trimShow")}
                      </Button>
                    )}
                  </div>
                )}

                {saveError ? <Alert>{errorMessage(saveError)}</Alert> : null}

                <div className="flex flex-col gap-2">
                  <Button size="lg" block disabled={!canSave} loading={saving && !overlaps.length} onClick={() => void save()}>
                    {t("save")}
                  </Button>
                  <p className="text-center text-xs text-ink/50">{draft.id ? t("saveNoteEdit") : t("saveNoteNew")}</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" block onClick={close}>
                      {t("cancel")}
                    </Button>
                    {draft.id && (
                      <>
                        <Button variant="ghost" onClick={() => setFeesOf(zones.find((z) => z.id === draft.id) ?? null)} aria-label={t("feeHistory")} title={t("feeHistory")}>
                          <History className="size-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" className="text-red-600" onClick={() => setConfirmRemove(true)} aria-label={t("remove")} title={t("remove")}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.div key="list" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="flex flex-col gap-5">
                {loading && !data ? (
                  Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-white" />)
                ) : !zones.length ? (
                  <EmptyState icon={<MapPinned className="size-7" />} title={t("emptyTitle")} body={t("emptyBody")} action={<Button onClick={startNew}>{t("new")}</Button>} />
                ) : (
                  grouped.map(
                    ({ kind, zones: list }) =>
                      list.length > 0 && (
                        <section key={kind} aria-labelledby={`zones-${kind}`}>
                          <h2 id={`zones-${kind}`} className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-widest text-ink/45">
                            {t(`groups.${kind}`)} <span className="rounded-full bg-ink/5 px-2 py-0.5 tabular-nums">{list.length}</span>
                          </h2>
                          <ul className="flex flex-col gap-2">
                            {list.map((zone) => {
                              const Icon = KIND_ICON[zone.kind];
                              return (
                                <li key={zone.id}>
                                  <button
                                    onClick={() => (selectedId === zone.id ? edit(zone) : setSelectedId(zone.id))}
                                    onDoubleClick={() => edit(zone)}
                                    aria-pressed={selectedId === zone.id}
                                    className={`flex w-full items-center gap-3 rounded-3xl bg-white p-3 pr-4 text-left shadow-sm ring-1 transition hover:-translate-y-px ${
                                      selectedId === zone.id ? "ring-2 ring-ink" : "ring-ink/5"
                                    }`}
                                  >
                                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${zone.kind === "URBAN" ? "bg-brand/30 text-chonta-strong" : "bg-leaf/15 text-leaf"}`}>
                                      <Icon className="size-5" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-bold">{zone.name}</span>
                                      <span className="block text-xs text-ink/50">{area(zone.areaSquareMeters)}</span>
                                    </span>
                                    <span className="price-tag shrink-0 text-sm">{money.price(zone.fee)}</span>
                                  </button>
                                  {selectedId === zone.id && (
                                    <div className="flex justify-end px-2 pt-1.5">
                                      <Button size="sm" variant="outline" onClick={() => edit(zone)}>
                                        <PenLine className="size-4" aria-hidden /> {t("edit")}
                                      </Button>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ),
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mapa */}
        <div className="relative order-1 h-[58dvh] min-h-[420px] overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5 lg:order-2 lg:h-[calc(100dvh-12rem)]">
          <ZonesMap
            fallbackCenter={center}
            zones={zones}
            selectedId={selectedId}
            editingId={draft?.id ?? null}
            draft={draft?.ring ?? null}
            mode={mode}
            conflicts={overlaps.map((o) => o.id)}
            preview={preview}
            probe={mode === "probe" ? probe : null}
            maxVertices={limits?.maxVertices ?? 300}
            formatFee={money.price}
            onSelect={setSelectedId}
            onDraftChange={changeRing}
            onCloseRing={() => setMode("edit")}
            onProbe={setProbe}
            labels={mapLabels}
          />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur">
              <Legend swatch="bg-brand ring-chonta-strong" label={t("groups.URBAN")} />
              <Legend swatch="bg-leaf/60 ring-leaf" label={t("groups.RURAL")} />
            </div>
            {!draft && zones.length > 0 && (
              <button
                onClick={() => {
                  setMode(mode === "probe" ? "view" : "probe");
                  setProbe(null);
                }}
                aria-pressed={mode === "probe"}
                className={`pointer-events-auto inline-flex h-10 items-center gap-2 rounded-2xl px-3.5 text-sm font-bold shadow-lg transition ${mode === "probe" ? "bg-ink text-brand" : "bg-white text-ink hover:bg-cream"}`}
              >
                <Crosshair className="size-4" aria-hidden /> {t("probe")}
              </button>
            )}
          </div>
          <AnimatePresence>
            {mode === "probe" && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="receipt-edge absolute inset-x-3 bottom-3 rounded-b-3xl bg-white p-4 shadow-2xl sm:left-auto sm:w-80"
                role="status"
              >
                {!probe ? (
                  <p className="text-sm text-ink/60">{t("probeHint")}</p>
                ) : probeZone ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">{t(`kinds.${probeZone.kind}`)}</p>
                      <p className="truncate font-display text-lg font-extrabold">{probeZone.name}</p>
                    </div>
                    <span className="price-tag text-base">{money.price(probeZone.fee)}</span>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-chonta-strong">{t("probeOutside")}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} title={t("removeTitle")} description={t("removeBody", { name: draft?.name ?? "" })} closeLabel={t("cancel")}>
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="danger" block loading={saving} onClick={() => void remove()}>
            {t("remove")}
          </Button>
          <Button variant="ghost" block onClick={() => setConfirmRemove(false)}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>

      <FeeHistoryDialog zone={feesOf} onClose={() => setFeesOf(null)} />
    </div>
  );
}

function FeeHistoryDialog({ zone, onClose }: { zone: Zone | null; onClose: () => void }) {
  const t = useTranslations("zones");
  const money = useCatalogFormat();
  const format = useFormatter();
  const { data, loading } = useResource(() => (zone ? container.businessAdmin.zoneFees(zone.id) : Promise.resolve([])), [zone?.id]);
  return (
    <Dialog open={!!zone} onClose={onClose} title={t("feeHistory")} description={zone?.name} closeLabel={t("cancel")}>
      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-ink/5" />
      ) : (
        <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-ink/15 pl-5">
          {(data ?? []).map((change, i) => (
            <li key={change.since} className="relative">
              <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-leaf" : "bg-ink/25"}`} aria-hidden />
              <p className="font-display text-lg font-extrabold tabular-nums">{money.price(change.fee)}</p>
              <p className="text-xs text-ink/55">
                {format.dateTime(new Date(change.since), { dateStyle: "medium", timeStyle: "short" })}
                {change.by ? ` · ${change.by}` : ""}
                {i === 0 ? ` · ${t("current")}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 text-xs text-ink/50">{t("feeHistoryNote")}</p>
    </Dialog>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3 rounded-[4px] ring-2 ${swatch}`} aria-hidden /> {label}
    </span>
  );
}

function ToolButton({ active, onClick, icon, label, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition disabled:opacity-40 ${active ? "bg-ink text-brand" : "bg-white text-ink/70 hover:text-ink"}`}
    >
      {icon} {label}
    </button>
  );
}
