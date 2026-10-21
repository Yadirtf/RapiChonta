import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderDetailView } from "@/presentation/views/orders/OrderDetailView";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ nuevo?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, t] = await Promise.all([params, getTranslations("orders")]);
  return { title: `${t("detailTitle")} ${decodeURIComponent(code).toUpperCase()} · RapiChonta`, robots: { index: false } };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ code }, { nuevo }] = await Promise.all([params, searchParams]);
  return <OrderDetailView code={decodeURIComponent(code)} placed={nuevo === "1"} />;
}
