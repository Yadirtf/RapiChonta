import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PanelSignInView } from "@/presentation/views/panel/PanelSignInView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("panelSignIn");
  return { title: `${t("title")} · RapiChonta`, robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <PanelSignInView />
    </Suspense>
  );
}
