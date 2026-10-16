"use client";

import { MessageSquareText, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SentCode } from "@/core/domain/entities/session";
import { ApiError } from "@/infrastructure/http/api-client";
import { mmss, useCountdown } from "../../hooks/useCountdown";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { OtpInput } from "./OtpInput";

/** Espera mínima antes de ofrecer reenviar (la API además limita a 3 envíos por hora). */
const RESEND_AFTER_MS = 45_000;

interface Props {
  sent: SentCode;
  sentAt: number;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onChangePhone?: () => void;
}

/** Paso común a todos los ingresos y al cambio de número: escribir el código recibido. */
export function CodeStep({ sent, sentAt, onVerify, onResend, onChangePhone }: Props) {
  const t = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const resendIn = useCountdown(sentAt + RESEND_AFTER_MS);
  const expiresIn = useCountdown(new Date(sent.expiresAt).getTime());
  // Con el código vencido o bloqueado no tiene sentido seguir escribiendo: hay que pedir otro.
  const dead = expiresIn === 0 || (error instanceof ApiError && ["OTP_EXPIRED", "OTP_LOCKED", "OTP_NOT_FOUND"].includes(error.code));

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(value);
    } catch (e) {
      setError(e);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await onResend();
      setCode("");
    } catch (e) {
      setError(e);
    } finally {
      setResending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-strong shadow-sm">
          <MessageSquareText className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-ink/70">
          {t.rich("codeSentTo", { phone: sent.maskedPhone, b: (chunks) => <strong className="whitespace-nowrap text-ink">{chunks}</strong> })}
          {onChangePhone && (
            <button type="button" onClick={onChangePhone} className="ml-1 font-semibold text-ink underline decoration-brand decoration-2 underline-offset-2">
              {t("changeNumber")}
            </button>
          )}
        </p>
      </div>

      {sent.devCode && (
        <Alert tone="info">
          {t("devCode")}{" "}
          <button type="button" className="font-mono font-bold underline" onClick={() => void verify(sent.devCode!)}>
            {sent.devCode}
          </button>
        </Alert>
      )}

      <OtpInput label={t("codeLabel")} value={code} onChange={setCode} onComplete={verify} disabled={busy || dead} invalid={!!error} />

      {error ? <Alert>{errorMessage(error)}</Alert> : null}

      <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6 || dead}>
        {t("verify")}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink/50" aria-live="polite">
          {expiresIn > 0 ? t("expiresIn", { time: mmss(expiresIn) }) : t("codeExpired")}
        </span>
        <button
          type="button"
          onClick={resend}
          disabled={resendIn > 0 || resending}
          className="inline-flex items-center gap-1.5 font-semibold text-ink disabled:text-ink/40"
        >
          <RotateCcw className={`size-4 ${resending ? "animate-spin" : ""}`} aria-hidden />
          {resendIn > 0 ? t("resendIn", { seconds: resendIn }) : t("resend")}
        </button>
      </div>
    </form>
  );
}
