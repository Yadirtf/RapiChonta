import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MerchantPortalView } from "@/presentation/views/merchant/MerchantPortalView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("merchant");
  return { title: `${t("metaTitle")} · RapiChonta`, robots: { index: false } };
}

/** E15: el portal del comercio aliado (su mostrador y su menú). */
export default function Page() {
  return (
    <Suspense>
      <MerchantPortalView />
    </Suspense>
  );
}
