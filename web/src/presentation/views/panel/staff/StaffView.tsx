"use client";

import { MoreHorizontal, Plus, ShieldOff, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { can, PERMISSIONS, type UserStatusCode } from "@/core/domain/entities/account";
import { ACCOUNT_TRANSITIONS, type StaffMember } from "@/core/domain/entities/staff";
import { container } from "@/infrastructure/di/container";
import { useAuth } from "../../../auth/AuthProvider";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { AccountStatusBadge } from "../../../components/panel/StatusBadges";
import { StatusChangeDialog } from "../../../components/panel/StatusChangeDialog";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { formatPhone, initials } from "../../../format";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";
import { CreateStaffDialog } from "./CreateStaffDialog";

const DESTRUCTIVE = new Set<UserStatusCode>(["SUSPENDED", "DEACTIVATED"]);

/** H01.4: personal del panel. Solo el administrador entra; al operador ni siquiera se le muestra. */
export function StaffView() {
  const t = useTranslations("staff");
  const { account } = useAuth();
  const allowed = can(account, PERMISSIONS.MANAGE_STAFF);
  if (!allowed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <EmptyState icon={<ShieldOff className="size-7" />} title={t("forbiddenTitle")} body={t("forbiddenBody")} />
      </div>
    );
  }
  return <StaffList selfId={account!.userId} />;
}

function StaffList({ selfId }: { selfId: string }) {
  const t = useTranslations("staff");
  const tr = useTranslations("roles");
  const ts = useTranslations("accountStatus");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [pending, setPending] = useState<{ member: StaffMember; to: UserStatusCode } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const list = useResource(() => container.admin.staff(), []);
  const options = useResource(() => container.admin.options(), []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="size-5" aria-hidden /> {t("new")}
          </Button>
        }
      />
      {created && <Alert tone="success">{t("createdNotice")}</Alert>}
      {list.error ? <Alert>{errorMessage(list.error)}</Alert> : null}

      {list.loading && !list.data ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-[24px] bg-white" />
          ))}
        </div>
      ) : list.data?.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title={t("emptyTitle")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data?.map((member) => {
            const actions = member.userId === selfId ? [] : (ACCOUNT_TRANSITIONS[member.accountStatus] ?? []);
            return (
              <li key={member.userId} className="relative flex flex-col gap-4 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-ink/5">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink font-extrabold text-brand">
                    {initials(member.givenNames, member.familyNames)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {[member.givenNames, member.familyNames].filter(Boolean).join(" ")}
                      {member.userId === selfId && <span className="ml-1.5 text-xs font-medium text-ink/45">{t("you")}</span>}
                    </p>
                    <p className="text-sm text-ink/55">{formatPhone(member.phone)}</p>
                  </div>
                  {actions.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setMenu(menu === member.userId ? null : member.userId)}
                        aria-label={t("actions")}
                        aria-expanded={menu === member.userId}
                        className="grid size-9 place-items-center rounded-xl text-ink/50 hover:bg-ink/5 hover:text-ink"
                      >
                        <MoreHorizontal className="size-5" />
                      </button>
                      {menu === member.userId && (
                        <div role="menu" className="absolute right-0 top-10 z-10 w-48 overflow-hidden rounded-2xl bg-white p-1 shadow-xl ring-1 ring-ink/10">
                          {actions.map((to) => (
                            <button
                              key={to}
                              role="menuitem"
                              onClick={() => {
                                setMenu(null);
                                setPending({ member, to });
                              }}
                              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface ${DESTRUCTIVE.has(to) ? "text-red-600" : ""}`}
                            >
                              {t(`action.${to}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {member.roles.map((r) => (
                    <Badge key={`${r.code}-${r.municipality}`} tone={r.code === "ADMIN" ? "dark" : "brand"}>
                      {tr(r.code)}
                      {r.municipality && <span className="font-normal opacity-70">· {r.municipality}</span>}
                    </Badge>
                  ))}
                  <AccountStatusBadge status={member.accountStatus} />
                </div>
                <p className="mt-auto text-xs text-ink/45">
                  {member.lastSignInAt ? t("lastSignIn", { when: format.relativeTime(new Date(member.lastSignInAt), new Date()) }) : t("neverSignedIn")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <CreateStaffDialog
        open={creating}
        options={options.data}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          setCreated(true);
          void list.reload();
        }}
      />
      {pending && (
        <StatusChangeDialog
          open
          title={t(`action.${pending.to}`)}
          body={t(`confirm.${pending.to}`, { name: pending.member.givenNames, status: ts(pending.to) })}
          confirmLabel={t("confirmAction")}
          destructive={DESTRUCTIVE.has(pending.to)}
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            await container.admin.changeUserStatus(pending.member.userId, pending.to, reason);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}
