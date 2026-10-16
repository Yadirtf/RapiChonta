"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, FileText, KeyRound, Languages, LogOut, Phone, ShieldCheck, Smartphone, Trash2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { fullName, usesPassword, type Account, type LegalDocumentType } from "@/core/domain/entities/account";
import { legalPath } from "@/core/domain/entities/legal";
import { LOCALES } from "@/i18n/config";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { Logo } from "../../components/ui/Logo";
import { formatPhone, initials } from "../../format";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { DeleteDataDialog } from "./DeleteDataDialog";
import { PasswordDialog } from "./PasswordDialog";
import { PhoneChangeDialog } from "./PhoneChangeDialog";

const LEGAL_FOR_CUSTOMER: LegalDocumentType[] = ["TERMS_OF_SERVICE", "DATA_PROCESSING_POLICY"];

/** H01.5: Mi cuenta. */
export function AccountView() {
  const t = useTranslations("account");
  const { status, account, requestSignIn } = useAuth();
  const [deleted, setDeleted] = useState(false);

  return (
    <main className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 border-b border-ink/5 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="grid size-10 place-items-center rounded-full text-ink/70 transition hover:bg-ink/5 hover:text-ink" aria-label={t("backToMap")}>
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-extrabold tracking-tight">{t("title")}</h1>
          <Logo compact />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        {status === "loading" && <AccountSkeleton />}
        {status === "anonymous" && deleted && (
          <Alert tone="success" className="mb-4">
            {t("deleted")}
          </Alert>
        )}
        {status === "anonymous" && <SignedOut onSignIn={() => void requestSignIn()} />}
        {status === "authenticated" && account && <SignedIn account={account} onDeleted={() => setDeleted(true)} />}
      </div>
    </main>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-28 rounded-[28px] bg-white" />
      <div className="h-40 rounded-[28px] bg-white" />
      <div className="h-24 rounded-[28px] bg-white" />
    </div>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  const t = useTranslations("account");
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[28px] bg-ink p-7 text-white shadow-xl sm:p-9"
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-brand text-ink">
        <Smartphone className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-2xl font-extrabold tracking-tight">{t("signedOutTitle")}</h2>
      <p className="mt-2 max-w-md text-white/70">{t("signedOutBody")}</p>
      <Button size="lg" className="mt-6" onClick={onSignIn}>
        {t("signIn")}
      </Button>
      <p className="mt-6 text-xs text-white/45">
        {t.rich("signedOutLegal", {
          link: (chunks) => (
            <Link href={legalPath("DATA_PROCESSING_POLICY")} className="underline underline-offset-2 hover:text-white">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </motion.section>
  );
}

function Section({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-surface text-ink/70">{icon}</span>
        <h2 className="flex-1 font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SignedIn({ account, onDeleted }: { account: Account; onDeleted: () => void }) {
  const t = useTranslations("account");
  const tr = useTranslations("roles");
  const router = useRouter();
  const { signOut, setAccount } = useAuth();
  const [dialog, setDialog] = useState<"phone" | "password" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <section className="flex items-center gap-4 rounded-[28px] bg-ink p-5 text-white shadow-lg sm:p-6">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-black text-ink">
          {initials(account.givenNames, account.familyNames)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold">{fullName(account)}</p>
          <p className="text-sm text-white/60">{formatPhone(account.phone)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {account.roles.map((role) => (
              <span
                key={role}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${role === account.activeRole ? "bg-brand text-ink" : "bg-white/10 text-white/75"}`}
              >
                {tr(role)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {notice && <Alert tone="success">{notice}</Alert>}

      <ProfileSection account={account} onSaved={(a) => (setAccount(a), setNotice(t("profileSaved")))} />

      <Section icon={<Phone className="size-4.5" />} title={t("phone")}>
        <Row label={formatPhone(account.phone)} hint={t("phoneHint")}>
          <Button variant="outline" size="sm" onClick={() => setDialog("phone")}>
            {t("change")}
          </Button>
        </Row>
      </Section>

      <LanguageSection />

      {usesPassword(account) && (
        <Section icon={<KeyRound className="size-4.5" />} title={t("security")}>
          <Row label={t("password")} hint={t("passwordHint")}>
            <Button variant="outline" size="sm" onClick={() => setDialog("password")}>
              {t("change")}
            </Button>
          </Row>
        </Section>
      )}

      <Section icon={<ShieldCheck className="size-4.5" />} title={t("privacy")}>
        <ul className="-mx-2 flex flex-col">
          {LEGAL_FOR_CUSTOMER.concat(account.roles.includes("COURIER") ? ["COURIER_LOCATION_AUTHORIZATION"] : []).map((doc) => (
            <li key={doc}>
              <Link href={legalPath(doc)} className="flex items-center gap-3 rounded-2xl px-2 py-3 text-sm font-medium transition hover:bg-surface">
                <FileText className="size-4 text-ink/50" aria-hidden />
                <span className="flex-1">{t(`legal.${doc}`)}</span>
                <ChevronRight className="size-4 text-ink/30" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button variant="dark" size="lg" className="flex-1" onClick={() => void signOut().then(() => router.push("/"))}>
          <LogOut className="size-4" aria-hidden /> {t("signOut")}
        </Button>
        <Button variant="ghost" size="lg" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDialog("delete")}>
          <Trash2 className="size-4" aria-hidden /> {t("deleteData")}
        </Button>
      </div>

      <PhoneChangeDialog open={dialog === "phone"} onClose={() => setDialog(null)} onChanged={(a) => (setAccount(a), setNotice(t("phoneChanged")))} />
      <PasswordDialog open={dialog === "password"} onClose={() => setDialog(null)} onChanged={() => setNotice(t("passwordChanged"))} />
      <DeleteDataDialog open={dialog === "delete"} onClose={() => setDialog(null)} onDeleted={onDeleted} />
    </motion.div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-xs text-ink/50">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ProfileSection({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const [givenNames, setGivenNames] = useState(account.givenNames);
  const [familyNames, setFamilyNames] = useState(account.familyNames ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = givenNames.trim() !== account.givenNames || (familyNames.trim() || null) !== account.familyNames;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await container.account.updateProfile(givenNames.trim(), familyNames.trim() || null));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={<UserRound className="size-4.5" />} title={t("personalData")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={ta("givenNames")} value={givenNames} onChange={(e) => setGivenNames(e.target.value)} autoComplete="given-name" maxLength={80} required />
          <TextField label={ta("familyNames")} value={familyNames} onChange={(e) => setFamilyNames(e.target.value)} autoComplete="family-name" maxLength={80} />
        </div>
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => (setGivenNames(account.givenNames), setFamilyNames(account.familyNames ?? ""))}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={!givenNames.trim()}>
              {t("save")}
            </Button>
          </div>
        )}
      </form>
    </Section>
  );
}

function LanguageSection() {
  const t = useTranslations("account");
  const locale = useLocale();
  const { changeLanguage } = useAuth();
  const [pending, startTransition] = useTransition();
  return (
    <Section icon={<Languages className="size-4.5" />} title={t("language")}>
      <div role="radiogroup" aria-label={t("language")} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
        {LOCALES.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={l === locale}
            disabled={pending}
            onClick={() => startTransition(() => changeLanguage(l))}
            className={`relative h-11 rounded-xl text-sm font-bold transition ${l === locale ? "text-ink" : "text-ink/50 hover:text-ink"}`}
          >
            {l === locale && <motion.span layoutId="language-pill" className="absolute inset-0 rounded-xl bg-white shadow-sm" />}
            <span className="relative">{t(`languages.${l}`)}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/50">{t("languageHint")}</p>
    </Section>
  );
}
