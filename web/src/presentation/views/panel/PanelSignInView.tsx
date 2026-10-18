"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isStaffSession } from "@/core/domain/entities/account";
import type { SentCode } from "@/core/domain/entities/session";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { CodeStep } from "../../components/auth/CodeStep";
import { looksLikeMobile, PhoneInput, phoneDigits } from "../../components/auth/PhoneInput";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { SidebarBackdrop } from "../../components/layout/SidebarBackdrop";
import { Logo, LogoEmblem } from "../../components/ui/Logo";
import { useErrorMessage } from "../../hooks/useErrorMessage";

/** Solo se vuelve a rutas del panel (evita redirecciones abiertas con ?next=). */
const safeNext = (next: string | null) => (next && /^\/panel(\/|$)/.test(next) ? next : "/panel");

/** H01.4: ingreso del personal con contraseña + código. */
export function PanelSignInView() {
  const t = useTranslations("panelSignIn");
  const ta = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { status, account, signedIn, signOut } = useAuth();
  const errorMessage = useErrorMessage();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState<{ code: SentCode; at: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notStaff, setNotStaff] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && isStaffSession(account)) router.replace(next);
  }, [status, account, next, router]);

  const start = async () => {
    const code = await container.auth.startPasswordSignIn(phoneDigits(phone), password, locale);
    setSent({ code, at: Date.now() });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotStaff(false);
    try {
      await start();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    const result = await container.auth.completePasswordSignIn(sent!.code.challengeId, code);
    if (!isStaffSession(result.account)) {
      // Un domiciliario con contraseña válida: su lugar es la app, no el panel.
      await signOut();
      setSent(null);
      setPassword("");
      setNotStaff(true);
      return;
    }
    signedIn(result.account);
    router.replace(next);
  };

  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[1.1fr_1fr]">
      <section className="relative isolate hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <SidebarBackdrop />
        <LogoEmblem priority className="w-40" />
        <div className="mt-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">{t("eyebrow")}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">{t("headline")}</h1>
          <p className="mt-4 text-white/80">{t("body")}</p>
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo tone="dark" />
          </span>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> {t("backToSite")}
          </Link>
        </div>

        <div className="m-auto w-full max-w-sm py-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-ink text-brand">
            <LockKeyhole className="size-6" aria-hidden />
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight">{sent ? ta("codeTitle") : t("title")}</h2>
          <p className="mt-2 text-ink/60">{sent ? t("codeSubtitle") : t("subtitle")}</p>

          <div className="mt-8">
            <AnimatePresence mode="wait" initial={false}>
              {sent ? (
                <motion.div key="code" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
                  <CodeStep sent={sent.code} sentAt={sent.at} onVerify={verify} onResend={start} onChangePhone={() => setSent(null)} />
                </motion.div>
              ) : (
                <motion.form
                  key="credentials"
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <PhoneInput label={ta("phoneLabel")} value={phone} onChange={setPhone} autoFocus />
                  <div className="relative">
                    <TextField
                      label={t("password")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                      className="absolute bottom-1.5 right-1.5 grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-ink/5 hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                    </button>
                  </div>
                  {notStaff && <Alert>{t("notStaff")}</Alert>}
                  {error ? <Alert>{errorMessage(error)}</Alert> : null}
                  <Button type="submit" size="lg" block loading={busy} disabled={!looksLikeMobile(phone) || !password}>
                    {t("continue")}
                  </Button>
                  <p className="text-center text-xs text-ink/50">{t("twoSteps")}</p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>
    </main>
  );
}
