"use client";

import { motion } from "framer-motion";
import { Bike, BookOpenText, ClipboardList, Clock, LayoutDashboard, Loader2, LogOut, Map, MapPinned, Radar, ShieldAlert, SlidersHorizontal, Store, Tags, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { can, fullName, isStaffSession, PERMISSIONS, STAFF_ROLES, type Account } from "@/core/domain/entities/account";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../auth/AuthProvider";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { SidebarBackdrop } from "../../components/layout/SidebarBackdrop";
import { Logo, LogoEmblem } from "../../components/ui/Logo";
import { initials } from "../../format";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { MunicipalitySwitcher, PanelMunicipalityProvider } from "./PanelMunicipality";

const NAV = [
  { href: "/panel", key: "home", icon: LayoutDashboard, permission: null },
  { href: "/panel/despacho", key: "dispatch", icon: ClipboardList, permission: PERMISSIONS.ASSIGN_ORDERS },
  { href: "/panel/establecimientos", key: "establishments", icon: Store, permission: PERMISSIONS.MANAGE_ESTABLISHMENTS },
  { href: "/panel/categorias", key: "categories", icon: Tags, permission: PERMISSIONS.MANAGE_CATEGORIES },
  { href: "/panel/domiciliarios", key: "couriers", icon: Bike, permission: PERMISSIONS.MANAGE_COURIERS },
  { href: "/panel/cobertura", key: "coverage", icon: Radar, permission: PERMISSIONS.MANAGE_ZONES },
  { href: "/panel/zonas", key: "zones", icon: MapPinned, permission: PERMISSIONS.MANAGE_ZONES },
  { href: "/panel/horario", key: "hours", icon: Clock, permission: PERMISSIONS.MANAGE_HOURS },
  { href: "/panel/configuracion", key: "settings", icon: SlidersHorizontal, permission: PERMISSIONS.MANAGE_SETTINGS },
  { href: "/panel/personal", key: "staff", icon: Users, permission: PERMISSIONS.MANAGE_STAFF },
  { href: "/panel/auditoria", key: "audit", icon: BookOpenText, permission: PERMISSIONS.READ_AUDIT },
] as const;

/**
 * Marco del panel (H01.4). Sin sesión de OPERATOR o ADMIN redirige al ingreso. El menú solo muestra lo
 * que el rol puede usar; la API rechaza igual cualquier llamada sin permiso.
 */
export function PanelShell({ children }: { children: ReactNode }) {
  const { status, account } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/panel/ingresar?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated" || !account) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface" aria-busy>
        <Loader2 className="size-6 animate-spin text-ink/40" aria-hidden />
      </div>
    );
  }
  if (!isStaffSession(account)) return <NotStaff account={account} />;

  const items = NAV.filter((item) => !item.permission || can(account, item.permission));
  return (
    <PanelMunicipalityProvider account={account}>
      <div className="flex min-h-dvh flex-col bg-surface lg:flex-row">
        <Sidebar account={account} items={items} pathname={pathname} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </PanelMunicipalityProvider>
  );
}

function Sidebar({ account, items, pathname }: { account: Account; items: (typeof NAV)[number][]; pathname: string }) {
  const t = useTranslations("panel");
  const tr = useTranslations("roles");
  const { signOut } = useAuth();
  const router = useRouter();
  const isActive = (href: string) => (href === "/panel" ? pathname === href : pathname.startsWith(href));
  const signOutToLogin = () => void signOut().then(() => router.replace("/panel/ingresar"));

  return (
    <aside className="sticky top-0 z-20 isolate flex shrink-0 flex-col bg-ink text-white lg:h-dvh lg:w-64">
      <SidebarBackdrop bar />
      <div className="flex items-center justify-between px-4 py-4 lg:justify-center lg:px-5 lg:pb-4 lg:pt-6">
        <Link href="/panel">
          <span className="lg:hidden">
            <Logo />
          </span>
          <span className="hidden lg:block">
            <LogoEmblem priority className="w-32" />
          </span>
        </Link>
        <div className="flex items-center gap-1 lg:hidden">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">{tr(account.activeRole)}</span>
          <button onClick={signOutToLogin} aria-label={t("signOut")} className="grid size-9 place-items-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white">
            <LogOut className="size-4.5" />
          </button>
        </div>
      </div>
      <MunicipalitySwitcher className="mx-3 mb-3" />
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0" aria-label={t("navigation")}>
        {items.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className="relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white lg:py-3"
          >
            {isActive(href) && <motion.span layoutId="panel-nav" className="absolute inset-0 rounded-xl bg-brand/15 ring-1 ring-brand/40" />}
            <Icon className={`relative size-5 ${isActive(href) ? "text-brand" : ""}`} aria-hidden />
            <span className={`relative ${isActive(href) ? "text-white" : ""}`}>{t(`nav.${key}`)}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden flex-col gap-1 border-t border-white/15 p-3 lg:flex">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white">
          <Map className="size-5" aria-hidden /> {t("viewSite")}
        </Link>
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10 backdrop-blur-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-sm font-extrabold text-ink">
            {initials(account.givenNames, account.familyNames)}
          </span>
          <div className="min-w-0 flex-1">
            <Link href="/cuenta" className="block truncate text-sm font-semibold hover:underline">
              {fullName(account)}
            </Link>
            <p className="text-xs text-brand">{tr(account.activeRole)}</p>
          </div>
          <button
            onClick={signOutToLogin}
            aria-label={t("signOut")}
            title={t("signOut")}
            className="grid size-9 place-items-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Sesión sin rol de personal. Si la cuenta sí tiene uno (por ejemplo, el administrador entró como cliente
 * en la web), puede pasar al panel confirmando su contraseña.
 */
function NotStaff({ account }: { account: Account }) {
  const t = useTranslations("panel");
  const tr = useTranslations("roles");
  const { setAccount, signOut } = useAuth();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const staffRole = STAFF_ROLES.slice().reverse().find((r) => account.roles.includes(r));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const switchRole = async () => {
    if (!staffRole) return;
    setBusy(true);
    setError(null);
    try {
      setAccount((await container.auth.switchRole(staffRole, password)).account);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-surface p-5">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-7 shadow-xl">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/20 text-brand-strong">
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        {staffRole ? (
          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void switchRole();
            }}
          >
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{t("switchTitle", { role: tr(staffRole) })}</h1>
              <p className="mt-1 text-sm text-ink/60">{t("switchBody", { role: tr(account.activeRole) })}</p>
            </div>
            <TextField label={t("password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error ? <Alert>{errorMessage(error)}</Alert> : null}
            <Button type="submit" size="lg" block loading={busy} disabled={!password}>
              {t("switchAction")}
            </Button>
            <Button variant="ghost" block onClick={() => router.push("/")}>
              {t("viewSite")}
            </Button>
          </form>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{t("restrictedTitle")}</h1>
              <p className="mt-1 text-sm text-ink/60">{t("restrictedBody")}</p>
            </div>
            <Button size="lg" block onClick={() => void signOut().then(() => router.replace("/panel/ingresar"))}>
              {t("useOtherAccount")}
            </Button>
            <Button variant="ghost" block onClick={() => router.push("/")}>
              {t("viewSite")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
