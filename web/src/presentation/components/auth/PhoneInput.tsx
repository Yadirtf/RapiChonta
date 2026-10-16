"use client";

import { forwardRef } from "react";
import { FieldShell } from "../ui/Field";

/** Agrupa 10 dígitos colombianos como "300 123 4567" mientras se escribe. */
export const formatColombianMobile = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(" ");
};

export const phoneDigits = (value: string) => value.replace(/\D/g, "");

/** El celular se valida en la API (libphonenumber); aquí solo se exige la forma de un móvil colombiano. */
export const looksLikeMobile = (value: string) => /^3\d{9}$/.test(phoneDigits(value));

interface Props {
  label: string;
  value: string;
  onChange: (formatted: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput({ label, value, onChange, error, hint, disabled, autoFocus }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <div
          aria-invalid={invalid}
          className="flex h-14 items-center rounded-2xl border border-ink/12 bg-white transition focus-within:border-ink/40 focus-within:ring-4 focus-within:ring-brand/25 aria-[invalid=true]:border-red-500"
        >
          <span className="flex h-full items-center gap-1.5 border-r border-ink/10 pl-4 pr-3 text-[15px] font-semibold text-ink/70" aria-hidden>
            <span className="text-lg leading-none">🇨🇴</span> +57
          </span>
          <input
            ref={ref}
            id={id}
            data-autofocus={autoFocus || undefined}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="300 123 4567"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(formatColombianMobile(e.target.value))}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold tracking-wide text-ink outline-none placeholder:font-normal placeholder:text-ink/30"
          />
        </div>
      )}
    </FieldShell>
  );
});
