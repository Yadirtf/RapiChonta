"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-brand text-ink hover:bg-[#ffcf55] focus-visible:ring-brand/50",
  dark: "bg-ink text-white hover:bg-ink/90 focus-visible:ring-ink/30",
  outline: "border border-ink/15 bg-white text-ink hover:bg-ink/[0.03] focus-visible:ring-ink/15",
  ghost: "text-ink/70 hover:bg-ink/5 hover:text-ink focus-visible:ring-ink/15",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/30",
} as const;

const SIZES = {
  sm: "h-9 rounded-xl px-3 text-sm",
  md: "h-11 rounded-2xl px-4 text-sm",
  lg: "h-13 rounded-2xl px-5 text-base",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, block = false, className = "", disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-[background-color,transform,opacity] outline-none focus-visible:ring-4 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
