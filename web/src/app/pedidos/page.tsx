import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyOrdersView } from "@/presentation/views/orders/MyOrdersView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders");
  return { title: `${t("title")} · RapiChonta`, robots: { index: false } };
}

export default function Page() {
  return <MyOrdersView />;
}
