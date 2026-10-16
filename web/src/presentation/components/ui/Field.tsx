"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Etiqueta, ayuda y error accesibles (aria-describedby / aria-invalid) para cualquier control. */
export function FieldShell({ label, hint, error, className = "", children }: FieldShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink/80">
        {label}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl border border-ink/12 bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/40 focus:ring-4 focus:ring-brand/25 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/15 disabled:bg-ink/[0.03] disabled:text-ink/50";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, containerClassName, className = "", ...props },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <input ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid} className={`${inputClass} ${className}`} {...props} />
      )}
    </FieldShell>
  );
});

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export function SelectField({ label, hint, error, containerClassName, className = "", children, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid} className={`${inputClass} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2314121f%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10 ${className}`} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
