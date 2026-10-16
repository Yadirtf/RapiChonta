"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Se llama al completar los 6 dígitos (escritos, pegados o autocompletados por el SMS). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  length?: number;
}

/**
 * Código de 6 dígitos en casillas. Un solo <input> por casilla, compatible con el autocompletado
 * de iOS/Android (autocomplete="one-time-code") y con pegar el código completo.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, label, length = 6 }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (!disabled && value === "") refs.current[0]?.focus();
  }, [disabled, value]);

  const commit = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    refs.current[Math.min(focusIndex, length - 1)]?.focus();
    if (clean.length === length) onComplete?.(clean);
  };

  const onInput = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Autocompletado del SMS o pegado en una casilla: llena desde ahí.
    const next = (value.slice(0, index) + typed).slice(0, length);
    commit(next, index + typed.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) commit(value.slice(0, index) + value.slice(index + 1), index);
      else if (index > 0) commit(value.slice(0, index - 1) + value.slice(index), index - 1);
    } else if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    commit(event.clipboardData.getData("text"), length);
  };

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? length : 1}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid}
          onChange={(e) => onInput(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-full min-w-0 max-w-14 rounded-2xl border bg-white text-center text-2xl font-extrabold text-ink outline-none transition focus:border-ink/50 focus:ring-4 focus:ring-brand/30 disabled:opacity-60 ${
            invalid ? "border-red-500 bg-red-50/50" : digit ? "border-ink/30" : "border-ink/12"
          }`}
        />
      ))}
    </div>
  );
}
