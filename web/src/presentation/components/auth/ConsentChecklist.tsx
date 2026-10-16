"use client";

import { Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LegalDocumentVersion } from "@/core/domain/entities/account";
import { legalPath } from "@/core/domain/entities/legal";

interface Props {
  documents: LegalDocumentVersion[];
  accepted: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}

/** Una casilla por documento vigente: la aceptación queda registrada con su versión (consents). */
export function ConsentChecklist({ documents, accepted, onToggle, disabled }: Props) {
  const t = useTranslations("consents");
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => {
        const checked = accepted.has(doc.id);
        return (
          <li key={doc.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${
                checked ? "border-ink/25 bg-brand/10" : "border-ink/10 bg-white hover:border-ink/25"
              }`}
            >
              <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={() => onToggle(doc.id)} />
              <span
                aria-hidden
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40 ${
                  checked ? "border-ink bg-ink text-brand" : "border-ink/25 bg-white"
                }`}
              >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="text-sm leading-snug text-ink/80">
                {t.rich("accept", {
                  type: doc.documentType,
                  document: t(`documents.${doc.documentType}`),
                  link: (chunks) => (
                    <a
                      href={legalPath(doc.documentType)}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 font-semibold text-ink underline decoration-brand decoration-2 underline-offset-2"
                    >
                      {chunks}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ),
                })}
                <span className="mt-0.5 block text-xs text-ink/40">{t("version", { version: doc.versionLabel })}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
