"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useApproximate } from "../../business/BusinessProvider";

/** "≈ US$ 6,10" bajo un precio en pesos (H03.4). Si la tasa no es de hoy, la fecha va en el título. */
export function ApproxPrice({ cents, className = "" }: { cents: number; className?: string }) {
  const t = useTranslations("business");
  const format = useFormatter();
  const approx = useApproximate()(cents);
  if (!approx) return null;
  const date = format.dateTime(new Date(approx.rate.fetchedAt), { day: "numeric", month: "short" });
  return (
    <span className={`text-xs font-semibold tabular-nums text-ink/50 ${className}`} title={approx.rate.isToday ? t("approxNote") : t("approxStale", { date })}>
      {approx.text}
      {!approx.rate.isToday && <span className="ml-1 text-[10px] font-medium">({date})</span>}
    </span>
  );
}
