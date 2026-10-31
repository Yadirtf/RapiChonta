"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { MerchantStore } from "@/core/domain/entities/merchant";
import { container } from "@/infrastructure/di/container";
import { useErrorMessage } from "../../hooks/useErrorMessage";

const OPEN = "ACTIVE";
const PAUSED = "TEMPORARILY_CLOSED";

/**
 * El aviso colgado de la puerta (H15.1): se voltea para abrir o pausar el local, como el cartel de cartón de la
 * tienda. Solo entre abierto y en pausa; publicar o dar de baja el local sigue siendo de RapiChonta.
 */
export function DoorSignToggle({ store, onChanged }: { store: MerchantStore; onChanged: () => void }) {
  const t = useTranslations("merchant.door");
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = optimistic ?? store.status;
  const flippable = status === OPEN || status === PAUSED;
  const open = status === OPEN;

  const flip = async () => {
    if (!flippable || busy) return;
    setBusy(true);
    setError(null);
    setOptimistic(open ? PAUSED : OPEN);
    try {
      await container.merchant.setOpen(store.id, !open);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void flip()}
        disabled={!flippable || busy}
        aria-pressed={open}
        title={flippable ? (open ? t("pauseHint") : t("openHint")) : t("lockedHint")}
        className="door-sign group shrink-0 [perspective:400px] disabled:cursor-not-allowed"
      >
        <motion.span
          key={status}
          initial={{ rotateY: 90 }}
          animate={{ rotateY: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className={`block rounded-xl border-2 px-4 py-2 text-center shadow-md transition-transform group-hover:-rotate-2 ${open ? "border-emerald-300 bg-leaf text-white" : "border-ink/15 bg-white text-ink"}`}
        >
          <span className="block font-display text-sm font-extrabold uppercase tracking-[0.16em]">
            {t(open ? "open" : status === PAUSED ? "paused" : "closed")}
          </span>
          <span className={`block text-[10px] font-bold ${open ? "text-white/80" : "text-ink/50"}`}>
            {flippable ? t(open ? "tapToPause" : "tapToOpen") : t("byRapiChonta")}
          </span>
        </motion.span>
      </button>
      {error && <p className="max-w-48 text-right text-xs font-semibold text-chonta-strong">{error}</p>}
    </div>
  );
}
