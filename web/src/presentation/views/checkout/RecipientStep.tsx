"use client";

import { UserRound, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SavedRecipient } from "@/core/domain/entities/order";
import { formatColombianMobile, PhoneInput } from "../../components/auth/PhoneInput";
import { TextField } from "../../components/ui/Field";
import { formatPhone, initials } from "../../format";
import type { CheckoutDraft } from "./checkout-draft";
import { ChoiceChip } from "./StepCard";

/**
 * Paso 2 (H04.2): el pedido puede ser para otra persona (la mamá, un vecino). A quien ya se le envió
 * queda a un toque; el número solo lo ve el domiciliario cuando va en camino.
 */
export function RecipientStep({ draft, onChange, recipients, myPhone, showErrors }: {
  draft: CheckoutDraft;
  onChange: (patch: Partial<CheckoutDraft>) => void;
  recipients: SavedRecipient[];
  myPhone: string | null;
  showErrors: boolean;
}) {
  const t = useTranslations("checkout");
  const r = draft.recipient;
  const forSomeone = r.kind !== "me";
  const someone = () => onChange({ recipient: recipients[0] ? { kind: "saved", id: recipients[0].id } : { kind: "new", fullName: "", phone: "" } });

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t("stepWho")} className="grid grid-cols-2 gap-1 rounded-2xl bg-ink/[0.05] p-1">
        {[
          { key: "me", on: !forSomeone, icon: UserRound, label: t("forMe"), select: () => onChange({ recipient: { kind: "me" } }) },
          { key: "other", on: forSomeone, icon: UsersRound, label: t("forSomeone"), select: () => !forSomeone && someone() },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={option.on}
            onClick={option.select}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-brand/40 ${
              option.on ? "bg-white text-ink shadow" : "text-ink/55 hover:text-ink"
            }`}
          >
            <option.icon className="size-4" aria-hidden /> {option.label}
          </button>
        ))}
      </div>

      {!forSomeone ? (
        myPhone && <p className="text-sm text-ink/60">{t("forMeHint", { phone: formatPhone(myPhone) })}</p>
      ) : (
        <>
          {recipients.length > 0 && (
            <div role="radiogroup" aria-label={t("savedRecipients")} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink/80">{t("savedRecipients")}</p>
              <div className="flex flex-wrap gap-2">
                {recipients.map((person) => (
                  <ChoiceChip key={person.id} selected={r.kind === "saved" && r.id === person.id} onClick={() => onChange({ recipient: { kind: "saved", id: person.id } })}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chonta/15 text-xs font-extrabold text-chonta-strong" aria-hidden>
                      {initials(person.fullName.split(" ")[0], person.fullName.split(" ").slice(1).at(-1))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{person.fullName}</span>
                      <span className="block text-xs font-medium tabular-nums text-ink/55">{formatPhone(person.phone)}</span>
                    </span>
                  </ChoiceChip>
                ))}
                <ChoiceChip selected={r.kind === "new"} onClick={() => onChange({ recipient: { kind: "new", fullName: "", phone: "" } })}>
                  {t("newRecipient")}
                </ChoiceChip>
              </div>
            </div>
          )}
          {r.kind === "new" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label={t("recipientName")}
                autoComplete="off"
                value={r.fullName}
                maxLength={120}
                onChange={(e) => onChange({ recipient: { ...r, fullName: e.target.value } })}
                error={showErrors && r.fullName.trim().length < 2 ? t("missingRecipient") : null}
              />
              <PhoneInput
                label={t("recipientPhone")}
                value={r.phone}
                onChange={(phone) => onChange({ recipient: { ...r, phone: formatColombianMobile(phone) } })}
                hint={t("recipientHint")}
                error={showErrors && !/^3\d{9}$/.test(r.phone.replace(/\D/g, "")) ? t("missingRecipientPhone") : null}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
