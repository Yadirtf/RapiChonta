"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Account } from "@/core/domain/entities/account";
import type { SentCode } from "@/core/domain/entities/session";
import { container } from "@/infrastructure/di/container";
import { CodeStep } from "../../components/auth/CodeStep";
import { looksLikeMobile, PhoneInput, phoneDigits } from "../../components/auth/PhoneInput";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useErrorMessage } from "../../hooks/useErrorMessage";

/** Cambio de celular: el número nuevo se confirma con un código enviado a ese número. */
export function PhoneChangeDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: (a: Account) => void }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ code: SentCode; at: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setSent(null);
      setPhone("");
      setError(null);
    }, 250);
  };

  const send = async () => {
    const code = await container.account.requestPhoneChange(phoneDigits(phone), locale);
    setSent({ code, at: Date.now() });
  };

  const submit = async () => {
    if (!looksLikeMobile(phone)) return setPhoneError(ta("phoneInvalid"));
    setPhoneError(null);
    setBusy(true);
    setError(null);
    try {
      await send();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={t("changePhoneTitle")} description={sent ? undefined : t("changePhoneSubtitle")} closeLabel={ta("close")}>
      {sent ? (
        <CodeStep
          sent={sent.code}
          sentAt={sent.at}
          onVerify={async (code) => {
            onChanged(await container.account.confirmPhoneChange(sent.code.challengeId, code));
            close();
          }}
          onResend={send}
          onChangePhone={() => setSent(null)}
        />
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <PhoneInput label={t("newPhone")} value={phone} onChange={setPhone} error={phoneError} autoFocus />
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          <Button type="submit" size="lg" block loading={busy}>
            {ta("sendCode")}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
