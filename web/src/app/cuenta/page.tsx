import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountView } from "@/presentation/views/account/AccountView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: `${t("title")} · RapiChonta`, robots: { index: false } };
}

export default function Page() {
  return <AccountView />;
}
