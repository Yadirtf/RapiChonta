"use client";

import { Bike, LocateFixed, MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toCents } from "@/core/domain/entities/money";
import type { DeliveryQuote } from "@/core/domain/entities/business";
import { container } from "@/infrastructure/di/container";
import { isApiError } from "@/infrastructure/http/api-client";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useGeolocation } from "../../hooks/useGeolocation";
import { ApproxPrice } from "../business/ApproxPrice";

type State = { kind: "loading" } | { kind: "quote"; quote: DeliveryQuote } | { kind: "outside" } | { kind: "unknown" };

/**
 * Domicilio estimado a la ubicación actual (H03.1): la tarifa fija de la zona donde está el cliente, o el
 * aviso de que esa ubicación está fuera de cobertura. La dirección exacta se elige al confirmar (E04).
 */
export function DeliveryEstimate({ establishmentId, subtotalCents }: { establishmentId: string; subtotalCents: number }) {
  const t = useTranslations("business");
  const money = useCatalogFormat();
  const { position, status } = useGeolocation();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "granted") {
      setState({ kind: "unknown" });
      return;
    }
    let cancelled = false;
    container.business.quote(establishmentId, position).then(
      (quote) => !cancelled && setState({ kind: "quote", quote }),
      (error) => !cancelled && setState(isApiError(error, "NO_COVERAGE") ? { kind: "outside" } : { kind: "unknown" }),
    );
    return () => {
      cancelled = true;
    };
  }, [establishmentId, position, status]);

  if (state.kind === "loading") return <div className="h-12 animate-pulse rounded-2xl bg-ink/5" aria-busy />;
  if (state.kind === "outside") {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-chonta-soft px-3.5 py-3 text-sm font-semibold text-chonta-strong" role="status">
        <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("outsideCoverage")}
      </p>
    );
  }
  if (state.kind === "unknown") {
    return (
      <p className="flex items-start gap-2 text-xs text-ink/55">
        <LocateFixed className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("feeOnConfirm")}
      </p>
    );
  }

  const feeCents = toCents(state.quote.fee);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-ink/70">
          <Bike className="size-4 shrink-0 text-leaf" aria-hidden />
          <span className="truncate">{t("deliveryTo", { zone: state.quote.zone.name })}</span>
        </span>
        <span className="font-display font-extrabold tabular-nums">{money.cents(feeCents)}</span>
      </div>
      <div className="flex items-baseline justify-between border-t border-dashed border-ink/20 pt-2">
        <span className="text-sm font-bold">{t("estimatedTotal")}</span>
        <span className="flex flex-col items-end">
          <span className="font-display text-2xl font-extrabold tabular-nums">{money.cents(subtotalCents + feeCents)}</span>
          <ApproxPrice cents={subtotalCents + feeCents} />
        </span>
      </div>
    </div>
  );
}
