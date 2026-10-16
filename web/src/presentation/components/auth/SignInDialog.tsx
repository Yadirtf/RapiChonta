"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Account } from "@/core/domain/entities/account";
import type { RegistrationRequired, SentCode } from "@/core/domain/entities/session";
import { container } from "@/infrastructure/di/container";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { TextField } from "../ui/Field";
import { CodeStep } from "./CodeStep";
import { ConsentChecklist } from "./ConsentChecklist";
import { looksLikeMobile, PhoneInput, phoneDigits } from "./PhoneInput";

type Step =
  | { name: "phone" }
  | { name: "code"; sent: SentCode; sentAt: number }
  | { name: "profile"; registration: RegistrationRequired };

interface Props {
  open: boolean;
  onClose: () => void;
  onSignedIn: (account: Account) => void;
}

/**
 * Ingreso del cliente (H01.1): celular → código → (solo la primera vez) nombre y aceptación.
 * Sin contraseñas. Se abre desde "Mi cuenta" y, más adelante, al confirmar el pedido.
 */
export function SignInDialog({ open, onClose, onSignedIn }: Props) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [givenNames, setGivenNames] = useState("");
  const [familyNames, setFamilyNames] = useState("");
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const reset = () => {
    setStep({ name: "phone" });
    setError(null);
    setPhoneError(null);
    setAccepted(new Set());
  };

  const close = () => {
    onClose();
    // Se limpia al terminar la animación de salida.
    window.setTimeout(reset, 250);
  };

  const sendCode = async () => {
    const sent = await container.auth.requestCode(phoneDigits(phone), locale);
    setStep({ name: "code", sent, sentAt: Date.now() });
  };

  const submitPhone = async () => {
    if (!looksLikeMobile(phone)) {
      setPhoneError(t("phoneInvalid"));
      return;
    }
    setPhoneError(null);
    setError(null);
    setBusy(true);
    try {
      await sendCode();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (challengeId: string, code: string) => {
    const result = await container.auth.verifyCode(challengeId, code);
    if (result.status === "SIGNED_IN") {
      onSignedIn(result.account);
      close();
    } else {
      setError(null);
      setStep({ name: "profile", registration: result });
    }
  };

  const register = async (registration: RegistrationRequired) => {
    setBusy(true);
    setError(null);
    try {
      const result = await container.auth.register({
        registrationToken: registration.registrationToken,
        givenNames: givenNames.trim(),
        familyNames: familyNames.trim() || undefined,
        acceptedLegalVersionIds: [...accepted],
        language: locale,
      });
      onSignedIn(result.account);
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    phone: [t("signInTitle"), t("signInSubtitle")],
    code: [t("codeTitle"), undefined],
    profile: [t("profileTitle"), t("profileSubtitle")],
  } as const;
  const [title, description] = titles[step.name];

  return (
    <Dialog open={open} onClose={close} title={title} description={description} closeLabel={t("close")}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.name}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
        >
          {step.name === "phone" && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPhone();
              }}
            >
              <PhoneInput label={t("phoneLabel")} value={phone} onChange={setPhone} error={phoneError} hint={t("phoneHint")} autoFocus />
              {error ? <Alert>{errorMessage(error)}</Alert> : null}
              <Button type="submit" size="lg" block loading={busy}>
                {t("sendCode")}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink/50">
                <ShieldCheck className="size-3.5" aria-hidden /> {t("noPassword")}
              </p>
            </form>
          )}

          {step.name === "code" && (
            <CodeStep
              sent={step.sent}
              sentAt={step.sentAt}
              onVerify={(code) => verify(step.sent.challengeId, code)}
              onResend={sendCode}
              onChangePhone={reset}
            />
          )}

          {step.name === "profile" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void register(step.registration);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("givenNames")} value={givenNames} onChange={(e) => setGivenNames(e.target.value)} autoComplete="given-name" maxLength={80} required data-autofocus />
                <TextField label={t("familyNames")} value={familyNames} onChange={(e) => setFamilyNames(e.target.value)} autoComplete="family-name" maxLength={80} hint={t("optional")} />
              </div>
              <ConsentChecklist
                documents={step.registration.requiredConsents}
                accepted={accepted}
                disabled={busy}
                onToggle={(id) =>
                  setAccepted((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
              {error ? <Alert>{errorMessage(error)}</Alert> : null}
              <Button
                type="submit"
                size="lg"
                block
                loading={busy}
                disabled={!givenNames.trim() || step.registration.requiredConsents.some((d) => !accepted.has(d.id))}
              >
                {t("createAccount")}
              </Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </Dialog>
  );
}
