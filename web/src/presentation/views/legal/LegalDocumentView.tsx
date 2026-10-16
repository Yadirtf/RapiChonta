import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { LegalDocumentType } from "@/core/domain/entities/account";
import { LEGAL_SLUGS } from "@/core/domain/entities/legal";
import { Logo } from "../../components/ui/Logo";

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

/**
 * Texto de los documentos legales (RF-07). La versión vigente que el usuario acepta se registra en la
 * base de datos (legal_document_versions); este texto corresponde a esa versión.
 */
export async function LegalDocumentView({ type }: { type: LegalDocumentType }) {
  const t = await getTranslations("legalDocs");
  const sections = t.raw(`${type}.sections`) as LegalSection[];

  return (
    <main className="min-h-dvh bg-surface">
      <header className="border-b border-ink/5 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="grid size-10 place-items-center rounded-full text-ink/70 hover:bg-ink/5" aria-label={t("back")}>
            <ArrowLeft className="size-5" />
          </Link>
          <Logo tone="dark" />
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm font-semibold text-brand-strong">{t("version", { version: t(`${type}.version`) })}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t(`${type}.title`)}</h1>
        <p className="mt-4 text-lg text-ink/70">{t(`${type}.intro`)}</p>
        <div className="mt-10 flex flex-col gap-8">
          {sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-lg font-bold">
                {i + 1}. {section.heading}
              </h2>
              {section.paragraphs.map((p, j) => (
                <p key={j} className="mt-2 leading-relaxed text-ink/75">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <nav className="mt-12 flex flex-wrap gap-2 border-t border-ink/10 pt-6" aria-label={t("otherDocuments")}>
          {(Object.keys(LEGAL_SLUGS) as LegalDocumentType[])
            .filter((other) => other !== type)
            .map((other) => (
              <Link key={other} href={`/legal/${LEGAL_SLUGS[other]}`} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-ink/10 hover:ring-ink/30">
                {t(`${other}.title`)}
              </Link>
            ))}
        </nav>
      </article>
    </main>
  );
}
