"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { UploadPurpose } from "@/core/domain/entities/catalog-admin";
import { container } from "@/infrastructure/di/container";

interface Props {
  purpose: UploadPurpose;
  label: string;
  onUploaded: (fileId: string, previewUrl: string) => void | Promise<void>;
  onError: (error: unknown) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Elige una foto (o la toma con la cámara del celular), la comprime y la sube en tres pasos. */
export function ImageUploadButton({ purpose, label, onUploaded, onError, disabled, className = "", children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fileId = await container.files.uploadImage(file, purpose);
      await onUploaded(fileId, URL.createObjectURL(file));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        aria-label={label}
        aria-busy={busy || undefined}
        className={`grid place-items-center gap-1 transition disabled:opacity-50 ${className}`}
      >
        {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : (children ?? <ImagePlus className="size-6" aria-hidden />)}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
    </>
  );
}
