"use client";

import { FileSignature, Handshake, ImagePlus, KeyRound, Phone, Trash2, UserPlus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { Partnership, PartnershipView } from "@/core/domain/entities/merchant";
import { container } from "@/infrastructure/di/container";
import { isApiError } from "@/infrastructure/http/api-client";
import { PhoneInput, phoneDigits } from "../../../components/auth/PhoneInput";
import { ImageUploadButton } from "../../../components/catalog/ImageUploadButton";
import { emptyPerson, PersonFields, type PersonForm } from "../../../components/panel/PersonFields";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { DatePicker } from "../../../components/ui/DatePicker";
import { formatPhone } from "../../../format";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";

const day = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * H15.1 en el panel: el convenio con el comercio y quién lo atiende en su portal. Con el convenio vigente, el cliente
 * puede pedirle directo (el comercio prepara y cobra al domiciliario); sin él, el local sigue siendo de compra por
 * RapiChonta. Solo el administrador.
 */
export function PartnershipPanel({ establishmentId }: { establishmentId: string }) {
  const t = useTranslations("partnership");
  const errorMessage = useErrorMessage();
  const view = useResource(() => container.partnerships.view(establishmentId), [establishmentId]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (action: () => Promise<PartnershipView>, done?: string) => {
    setError(null);
    setNotice(null);
    try {
      view.setData(await action());
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };

  if (view.error && !view.data) return <Alert>{errorMessage(view.error)}</Alert>;
  if (!view.data) return <div className="h-80 animate-pulse rounded-[28px] bg-white" aria-busy />;
  const data = view.data;
  const signed = data.current ?? data.upcoming;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-ink/5">
        <div className="chalkboard flex items-center gap-4 px-6 py-5 text-white">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${data.current ? "bg-leaf" : "bg-white/10"}`}>
            <Handshake className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold">{t("title")}</h2>
            <p className="text-sm text-white/70">{t(data.current ? "currentLead" : data.upcoming ? "upcomingLead" : "noneLead")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-5 p-6">
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {signed ? (
            <SignedAgreement partnership={signed} upcoming={!data.current} today={data.establishment.today} onEnd={(endedOn) => run(() => container.partnerships.end(establishmentId, { endedOn }), t("endedNotice"))} />
          ) : (
            <SignForm today={data.establishment.today} onError={setError} onSign={(input) => run(() => container.partnerships.start(establishmentId, input), t("signedNotice"))} />
          )}
          {data.past.length > 0 && (
            <details className="rounded-2xl bg-surface px-4 py-3 text-sm">
              <summary className="cursor-pointer font-bold text-ink/70">{t("history", { count: data.past.length })}</summary>
              <ul className="mt-2 flex flex-col gap-1 text-ink/60">
                {data.past.map((p) => (
                  <li key={p.id}>{t("pastRange", { from: day(p.startedOn), to: day(p.endedOn ?? p.startedOn) })}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      <Members data={data} establishmentId={establishmentId} run={run} />
    </div>
  );
}

function SignedAgreement({ partnership, upcoming, today, onEnd }: { partnership: Partnership; upcoming: boolean; today: string; onEnd: (endedOn: string) => Promise<boolean> }) {
  const t = useTranslations("partnership");
  const format = useFormatter();
  const [ending, setEnding] = useState(false);
  const [endedOn, setEndedOn] = useState(today);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`stamp ${upcoming ? "text-brand-strong" : "text-leaf"}`}>{t(upcoming ? "stampUpcoming" : "stampCurrent")}</span>
        <p className="text-sm text-ink/70">
          {t(upcoming ? "startsOn" : "since", { date: day(partnership.startedOn) })}
          {partnership.endedOn && <> · {t("until", { date: day(partnership.endedOn) })}</>}
        </p>
      </div>
      <p className="text-xs text-ink/50">{t("signedBy", { name: partnership.createdBy, at: format.dateTime(new Date(partnership.createdAt), { dateStyle: "medium" }) })}</p>
      {partnership.agreementUrl && (
        <a href={partnership.agreementUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl ring-1 ring-ink/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partnership.agreementUrl} alt={t("agreementAlt")} className="max-h-56 w-full object-cover transition group-hover:scale-[1.02]" />
        </a>
      )}
      {!partnership.endedOn &&
        (ending ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-chonta-soft/60 p-4">
            <DatePicker label={t("endOn")} value={endedOn} min={today} onChange={setEndedOn} />
            <p className="text-xs text-ink/60">{t(upcoming ? "cancelHint" : "endHint")}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEnding(false)}>
                {t("back")}
              </Button>
              <Button
                block
                variant="danger"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  if (await onEnd(endedOn)) setEnding(false);
                  setBusy(false);
                }}
              >
                {t(upcoming ? "cancelAction" : "endAction")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setEnding(true)}>
            {t(upcoming ? "cancelAction" : "endAction")}
          </Button>
        ))}
    </div>
  );
}

function SignForm({ today, onSign, onError }: { today: string; onSign: (input: { startedOn: string; agreementFileId?: string }) => Promise<boolean>; onError: (e: unknown) => void }) {
  const t = useTranslations("partnership");
  const [startedOn, setStartedOn] = useState(today);
  const [agreement, setAgreement] = useState<{ id: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSign({ startedOn, agreementFileId: agreement?.id });
        setBusy(false);
      }}
    >
      <ul className="flex flex-col gap-2 text-sm text-ink/70">
        {(["point1", "point2", "point3"] as const).map((key) => (
          <li key={key} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-chonta" aria-hidden />
            {t(key)}
          </li>
        ))}
      </ul>
      <DatePicker label={t("startOn")} value={startedOn} min={today} onChange={setStartedOn} />
      <div className="flex items-center gap-4">
        <ImageUploadButton
          purpose="PARTNERSHIP_AGREEMENT"
          label={t("agreementUpload")}
          onUploaded={(id, preview) => setAgreement({ id, preview })}
          onError={onError}
          className="size-24 shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-ink/15 bg-surface text-ink/50 hover:border-ink/30"
        >
          {agreement ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agreement.preview} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6" aria-hidden />
          )}
        </ImageUploadButton>
        <p className="text-sm text-ink/60">{t(agreement ? "agreementReady" : "agreementHint")}</p>
      </div>
      <Button type="submit" size="lg" loading={busy} className="self-start">
        <FileSignature className="size-5" aria-hidden /> {t("signAction")}
      </Button>
    </form>
  );
}

function Members({ data, establishmentId, run }: { data: PartnershipView; establishmentId: string; run: (action: () => Promise<PartnershipView>, done?: string) => Promise<boolean> }) {
  const t = useTranslations("partnership");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const options = useResource(() => container.admin.options(), []);
  const [phone, setPhone] = useState("");
  const [person, setPerson] = useState<PersonForm | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const allowed = !!(data.current ?? data.upcoming);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = person ? { ...person, phone: phoneDigits(phone) } : { phone: phoneDigits(phone) };
      await run(async () => {
        try {
          return await container.partnerships.addMember(establishmentId, input);
        } catch (e) {
          // Número sin cuenta de comercio: se piden sus datos para crearla.
          if (isApiError(e, "MERCHANT_PERSON_REQUIRED") && !person) setPerson({ ...emptyPerson(), phone });
          else setError(e);
          throw e;
        }
      }, t("memberAdded"));
      setPhone("");
      setPerson(null);
    } catch {
      // El mensaje ya quedó en pantalla (o se pidieron los datos).
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-5 rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-ink/5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand text-ink">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight">{t("membersTitle")}</h2>
          <p className="text-sm text-ink/55">{t("membersLead")}</p>
        </div>
      </div>

      {data.members.length ? (
        <ul className="flex flex-col divide-y divide-ink/5">
          {data.members.map((m) => (
            <li key={m.staffId} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink font-display text-sm font-extrabold text-brand">{m.givenNames.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{[m.givenNames, m.familyNames].filter(Boolean).join(" ")}</p>
                <p className="flex items-center gap-1 text-xs text-ink/55">
                  <Phone className="size-3" aria-hidden /> {formatPhone(m.phone)} ·{" "}
                  {m.lastSignInAt ? t("lastSignIn", { at: format.relativeTime(new Date(m.lastSignInAt), new Date()) }) : t("neverSignedIn")}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={t("revoke")} title={t("revoke")} onClick={() => void run(() => container.partnerships.revokeMember(establishmentId, m.staffId), t("memberRevoked"))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-ink/10 px-4 py-5 text-center text-sm text-ink/50">{t(allowed ? "noMembers" : "membersNeedAgreement")}</p>
      )}

      {allowed && (
        <form
          className="flex flex-col gap-4 rounded-2xl bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          {person ? (
            <>
              <p className="text-sm font-semibold text-ink/70">{t("newAccount")}</p>
              <PersonFields value={{ ...person, phone }} onChange={(v) => (setPerson(v), setPhone(v.phone))} documentTypes={options.data?.documentTypes ?? ["CC"]} />
            </>
          ) : (
            <PhoneInput label={t("memberPhone")} value={phone} onChange={setPhone} />
          )}
          <div className="flex gap-2">
            {person && (
              <Button variant="ghost" onClick={() => setPerson(null)}>
                {t("back")}
              </Button>
            )}
            <Button type="submit" variant="dark" loading={busy} disabled={phoneDigits(phone).length < 7}>
              <UserPlus className="size-4" aria-hidden /> {t(person ? "createAndGrant" : "grant")}
            </Button>
          </div>
          <p className="text-xs text-ink/50">{t("portalHint")}</p>
        </form>
      )}
    </section>
  );
}
