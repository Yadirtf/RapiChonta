import { useId } from "react";

/**
 * Marca de RapiChonta: un chontaduro (con su racimo) cuya silueta es un pin de mapa, sobre la placa
 * amarilla. El mismo dibujo está en web/public/brand/logo-mark.svg y app/lib/app/brand_logo.dart.
 */
export function LogoMark({ className = "size-10" }: { className?: string }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#B83A1B" />
          <stop offset="0.45" stopColor="#E4572E" />
          <stop offset="1" stopColor="#F7A531" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="#FFC531" />
      <path d="M5.5 21h5.5M4 26.5h7M6.5 32h4.5" stroke="#14121F" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="36.4" cy="18.6" rx="6" ry="7.6" transform="rotate(24 36.4 18.6)" fill="#C9461F" stroke="#14121F" strokeWidth="2" />
      <path
        d="M26 43.5c-6.2-6-10.2-11.2-10.2-18.6 0-7 4.6-12.4 10.2-12.4s10.2 5.4 10.2 12.4c0 7.4-4 12.6-10.2 18.6z"
        fill={`url(#${gradient})`}
        stroke="#14121F"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <ellipse cx="21.8" cy="21" rx="2.1" ry="4.2" transform="rotate(18 21.8 21)" fill="#FFF7E2" fillOpacity=".85" />
      <path d="M26 10.2l1.7 2.4 2.9-.5-1.1 2.6H22.5l-1.1-2.6 2.9.5z" fill="#1F7A4D" stroke="#14121F" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false, tone = "light" }: { compact?: boolean; tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2" role={compact ? "img" : undefined} aria-label={compact ? "RapiChonta" : undefined}>
      <LogoMark />
      {!compact && (
        <span className={`font-display text-xl font-extrabold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>
          Rapi<span className={tone === "light" ? "text-chonta" : "text-chonta-strong"}>Chonta</span>
        </span>
      )}
    </span>
  );
}
