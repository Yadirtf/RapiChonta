import type { LegalDocumentType } from "./account";

/** Ruta pública de cada documento legal (el texto vive en messages/<idioma>.json → legalDocs). */
export const LEGAL_SLUGS: Record<LegalDocumentType, string> = {
  TERMS_OF_SERVICE: "terminos",
  DATA_PROCESSING_POLICY: "politica-de-datos",
  COURIER_LOCATION_AUTHORIZATION: "autorizacion-ubicacion",
};

export const legalPath = (type: LegalDocumentType) => `/legal/${LEGAL_SLUGS[type]}`;

export const legalTypeFromSlug = (slug: string) =>
  (Object.entries(LEGAL_SLUGS).find(([, s]) => s === slug)?.[0] as LegalDocumentType | undefined) ?? null;
