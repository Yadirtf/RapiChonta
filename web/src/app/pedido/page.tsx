import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckoutView } from "@/presentation/views/checkout/CheckoutView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: `${t("title")} · RapiChonta`, robots: { index: false } };
}

export default function Page() {
  return <CheckoutView />;
}
