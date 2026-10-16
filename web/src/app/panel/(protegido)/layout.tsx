import type { Metadata } from "next";
import { PanelShell } from "@/presentation/views/panel/PanelShell";

export const metadata: Metadata = { title: "Panel · RapiChonta", robots: { index: false } };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
