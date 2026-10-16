import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { LEGAL_SLUGS, legalTypeFromSlug } from "@/core/domain/entities/legal";
import { LegalDocumentView } from "@/presentation/views/legal/LegalDocumentView";

type Params = Promise<{ document: string }>;

export function generateStaticParams() {
  return Object.values(LEGAL_SLUGS).map((document) => ({ document }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const type = legalTypeFromSlug((await params).document);
  if (!type) return {};
  const t = await getTranslations(`legalDocs.${type}`);
  return { title: `${t("title")} · RapiChonta` };
}

export default async function Page({ params }: { params: Params }) {
  const type = legalTypeFromSlug((await params).document);
  if (!type) notFound();
  return <LegalDocumentView type={type} />;
}
