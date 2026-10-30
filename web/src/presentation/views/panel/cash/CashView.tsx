"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bike, CalendarDays, Coins, Loader2, Lock, PackageCheck, Phone, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { can, PERMISSIONS } from "@/core/domain/entities/account";
import { boxLook, signedCents, type CourierBoxRow } from "@/core/domain/entities/cash";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { DatePicker } from "../../../components/ui/DatePicker";
import { Dialog } from "../../../components/ui/Dialog";
import { formatPhone, initials } from "../../../format";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { usePolling } from "../../../hooks/usePolling";
import { usePanelMunicipality } from "../PanelMunicipality";
import { CashBoxSheet } from "./CashBoxSheet";
import { OpenBaseDialog } from "./CashDialogs";
import { LOOK_SEAL } from "./cashVisuals";
import { dayBefore, useCashFormat } from "./useCashFormat";

/** Las cajas cambian con cada cobro: el tablero se refresca solo, sin apuro. */
const CASH_POLL_MS = 15_000;

export type CashNotice = { tone: "success" | "error"; text: string } | null;

/**
 * E11 · Cajas del día. La mesa del arqueo: cada domiciliario es un sobre de caja con su sello (sin base, abierta,
 * cerrada), lo que debe entregar en grande y, debajo, la base, lo cobrado y los pedidos. Al tocar un sobre se abre su
 * libreta (el libro del día) con el desglose, los ajustes firmados y el arqueo para cerrarla.
 */
export function CashView() {
  const t = useTranslations("cash");
  const { account } = useAuth();
  const { municipalityId, current } = usePanelMunicipality();
  const errorMessage = useErrorMessage();
  const format = useCashFormat();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [openBox, setOpenBox] = useState<string | null>(null);
  const [baseFor, setBaseFor] = useState<CourierBoxRow | null>(null);
  const [notice, setNotice] = useState<CashNotice>(null);

  const board = usePolling(() => container.cash.board({ municipalityId, date }), [municipalityId, date], CASH_POLL_MS);
  const data = board.data;
  const isToday = !!data && data.date === data.today;
  const rows = useMemo(() => data?.couriers ?? [], [data]);

  const summary = useMemo(() => {
    let due = 0;
    let bases = 0;
    let pending = 0;
    for (const r of rows) {
      if (r.box?.opening) bases += signedCents(r.box.opening);
      if (r.box?.state === "OPEN") {
        due += signedCents(r.box.amountDue);
        pending += 1;
      }
    }
    return {
      due,
      bases,
      pending,
      awaiting: rows.filter((r) => boxLook(r, isToday) === "awaitingBase").length,
    };
  }, [rows, isToday]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (board.loading && !data) {
    return (
      <div className="grid min-h-[60dvh] place-items-center" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }

  const done = (text: string) => {
    setNotice({ tone: "success", text });
    void board.refresh();
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-chonta-strong">{t("eyebrow")}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-ink/60">
            {t("subtitle", {
              municipality: current?.name ?? t("yourMunicipality"),
            })}
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("dayLabel")}>
            <DayChip active={isToday} onClick={() => setDate(undefined)} label={t("today")} />
            <DayChip active={data.date === dayBefore(data.today)} onClick={() => setDate(dayBefore(data.today))} label={t("yesterday")} />
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold ring-1 ring-ink/10 transition hover:ring-ink/25"
            >
              <CalendarDays className="size-4 text-ink/50" aria-hidden />
              {format.day(data.date)}
            </button>
          </div>
        )}
      </header>

      {board.error ? <Alert>{errorMessage(board.error)}</Alert> : null}

      {data && (
        <section aria-label={t("summaryLabel")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure icon={<Coins className="size-4" aria-hidden />} label={t("summaryDue")} value={format.cents(summary.due)} strong />
          <Figure icon={<Wallet className="size-4" aria-hidden />} label={t("summaryBases")} value={format.cents(summary.bases)} />
          <Figure icon={<PackageCheck className="size-4" aria-hidden />} label={t("summaryPending")} value={String(summary.pending)} />
          <Figure icon={<Lock className="size-4" aria-hidden />} label={t("summaryAwaiting")} value={String(summary.awaiting)} alert={summary.awaiting > 0} />
        </section>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-ink/10 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-white text-ink/35 shadow-sm">
            <Bike className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-bold">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-ink/55">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-7 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <li key={row.courier.userId}>
              <CashEnvelope row={row} isToday={isToday} onOpen={() => row.box && setOpenBox(row.box.id)} onGiveBase={() => setBaseFor(row)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={picking} onClose={() => setPicking(false)} title={t("pickDayTitle")} closeLabel={t("close")}>
        {data && (
          <DatePicker
            label={t("pickDayLabel")}
            value={data.date}
            onChange={(value) => {
              if (value > data.today) return;
              setDate(value === data.today ? undefined : value);
              setPicking(false);
            }}
          />
        )}
      </Dialog>

      <CashBoxSheet
        boxId={openBox}
        methods={data?.methods ?? []}
        canAdjust={can(account, PERMISSIONS.ADJUST_CASH)}
        onClose={() => setOpenBox(null)}
        onDone={done}
        onFailed={(error) => setNotice({ tone: "error", text: errorMessage(error) })}
      />

      <OpenBaseDialog
        row={baseFor}
        methods={data?.methods ?? []}
        onClose={() => setBaseFor(null)}
        onDone={(text) => {
          setBaseFor(null);
          done(text);
        }}
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className={`fixed bottom-5 left-1/2 z-[60] w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl px-5 py-3.5 text-sm font-bold shadow-2xl ${notice.tone === "success" ? "bg-ink text-white" : "bg-chonta text-white"}`}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DayChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-bold transition ${active ? "bg-ink text-brand" : "bg-white text-ink ring-1 ring-ink/10 hover:ring-ink/25"}`}
    >
      {label}
    </button>
  );
}

function Figure({ icon, label, value, strong, alert }: { icon: React.ReactNode; label: string; value: string; strong?: boolean; alert?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-3xl px-4 py-3.5 ${strong ? "bg-ink text-white" : alert ? "bg-chonta-soft text-chonta-strong" : "bg-white ring-1 ring-ink/8"}`}>
      <span className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] ${strong ? "text-brand" : alert ? "" : "text-ink/50"}`}>
        {icon} {label}
      </span>
      <span className="font-display text-2xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * El sobre de caja de un domiciliario: solapa de papel kraft, sello del estado y lo que debe entregar. Sin base (modo
 * CASH_BOX, hoy) el sobre está vacío y la acción es entregarla; con caja, se abre su libreta.
 */
function CashEnvelope({ row, isToday, onOpen, onGiveBase }: { row: CourierBoxRow; isToday: boolean; onOpen: () => void; onGiveBase: () => void }) {
  const t = useTranslations("cash");
  const format = useCashFormat();
  const look = boxLook(row, isToday);
  const due = row.box ? signedCents(row.box.amountDue) : 0;
  const name = `${row.courier.givenNames} ${row.courier.familyNames ?? ""}`.trim();

  return (
    <article className={`cash-envelope ${look === "awaitingBase" ? "is-empty" : ""} ${look === "closed" ? "is-sealed" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand font-display text-sm font-extrabold text-ink">{initials(row.courier.givenNames, row.courier.familyNames)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold">{name}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink/55">
            <span className="font-bold uppercase tracking-wider">{t(`mode.${row.fundingMode ?? "NONE"}`)}</span>
            {row.busy && (
              <span className="inline-flex items-center gap-1 font-semibold text-leaf">
                <Bike className="size-3.5" aria-hidden /> {t("busy")}
              </span>
            )}
          </p>
        </div>
        <span className={`shrink-0 -rotate-3 rounded-lg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${LOOK_SEAL[look]}`}>{t(`look.${look}`)}</span>
      </div>

      {look === "awaitingBase" ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-ink/65">{t("awaitingBody")}</p>
          <Button onClick={onGiveBase} variant="dark" block>
            <Wallet className="size-4 text-brand" aria-hidden /> {t("giveBase")}
          </Button>
        </div>
      ) : row.box ? (
        <button type="button" onClick={onOpen} className="mt-4 flex w-full flex-col gap-3 text-left" aria-label={t("openLedger", { name })}>
          <span className="flex items-end justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/50">{look === "closed" ? t("leftAfterClose") : due < 0 ? t("owedToCourier") : t("mustDeliver")}</span>
            <span className={`font-display text-3xl font-extrabold tabular-nums ${look === "closed" && due !== 0 ? "text-chonta-strong" : ""}`}>{format.cents(due)}</span>
          </span>
          <span className="grid grid-cols-3 gap-2 border-t-2 border-dashed border-ink/12 pt-3 text-xs">
            <Mini label={t("miniBase")} value={row.box.opening ? format.amount(row.box.opening) : "—"} />
            <Mini label={t("miniCollected")} value={format.amount(row.box.collected)} />
            <Mini label={t("miniOrders")} value={String(row.box.settledOrders)} />
          </span>
        </button>
      ) : (
        <p className="mt-5 text-sm text-ink/50">{t("idleBody")}</p>
      )}

      {row.courier.phone && (
        <a
          href={`tel:${row.courier.phone}`}
          className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-xs font-semibold text-ink/55 hover:bg-ink/5"
          title={formatPhone(row.courier.phone)}
        >
          <Phone className="size-3.5" aria-hidden /> {t("call")}
        </a>
      )}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-ink/45">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}
