"use client";

import { useTranslations } from "next-intl";
import type { EstablishmentStatus } from "@/core/domain/entities/establishment";

/** Cada estado tiene su toldo y su aviso de puerta: se reconoce de lejos en la lista del panel. */
export const STATUS_LOOK: Record<EstablishmentStatus, { awning: string; sign: string; dot: string }> = {
  DRAFT: { awning: "[--awning-a:#f5d68a] [--awning-b:#fffaf0]", sign: "border-amber-300 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  ACTIVE: { awning: "", sign: "border-emerald-300 bg-leaf text-white", dot: "bg-emerald-500" },
  TEMPORARILY_CLOSED: { awning: "[--awning-a:#b9b6c1] [--awning-b:#f4f2ee]", sign: "border-ink/20 bg-white text-ink/70", dot: "bg-ink/40" },
  INACTIVE: { awning: "[--awning-a:#e5a3a3] [--awning-b:#fdf3f3]", sign: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
};

export function EstablishmentStatusSign({ status, tilt = true }: { status: EstablishmentStatus; tilt?: boolean }) {
  const t = useTranslations("establishmentStatus");
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider shadow-sm ${STATUS_LOOK[status].sign} ${tilt ? "rotate-[-3deg]" : ""}`}
    >
      {t(status)}
    </span>
  );
}
