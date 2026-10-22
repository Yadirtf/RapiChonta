"use client";

import { Bike, CircleUserRound, Clock3, CreditCard, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { can, PERMISSIONS, type Account, type UserStatusCode } from "@/core/domain/entities/account";
import { ACCOUNT_TRANSITIONS, VERIFICATION_TRANSITIONS, type CourierDetail, type CourierVerificationCode, type IdentityOptions } from "@/core/domain/entities/staff";
import { container } from "@/infrastructure/di/container";
import { AccountStatusBadge, VerificationBadge } from "../../../components/panel/StatusBadges";
import { StatusChangeDialog } from "../../../components/panel/StatusChangeDialog";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { formatPhone } from "../../../format";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { MunicipalitySelect } from "./CreateCourierDialog";

type PendingChange =
  | { kind: "verification"; to: CourierVerificationCode }
  | { kind: "account"; to: UserStatusCode };

const DESTRUCTIVE = new Set<string>(["REJECTED", "SUSPENDED", "DEACTIVATED"]);

interface Props {
  courier: CourierDetail | null;
  loading: boolean;
  error: unknown;
  viewer: Account;
  justCreated?: boolean;
  /** Para corregir el municipio; sin opciones (o sin permiso) solo se muestra. */
  municipalities?: IdentityOptions["municipalities"];
  onClose: () => void;
  onChanged: (courier: CourierDetail) => void;
}

/** Ficha del domiciliario: datos, vehículo, cuentas de cobro, historial y acciones permitidas. */
export function CourierDetailDialog({ courier, loading, error, viewer, justCreated, municipalities, onClose, onChanged }: Props) {
  const t = useTranslations("couriers");
  const tc = useTranslations("catalog");
  const tv = useTranslations("verification");
  const ts = useTranslations("accountStatus");
  const td = useTranslations("documentTypes");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const open = loading || !!courier || !!error;

  const apply = async (reason: string) => {
    if (!courier || !pending) return;
    if (pending.kind === "verification") {
      onChanged(await container.admin.changeVerification(courier.userId, pending.to, reason));
    } else {
      await container.admin.changeUserStatus(courier.userId, pending.to, reason);
      onChanged(await container.admin.courier(courier.userId));
    }
  };

  const verificationActions = courier && can(viewer, PERMISSIONS.VERIFY_COURIERS) ? VERIFICATION_TRANSITIONS[courier.verificationStatus] : [];
  const accountActions = courier ? (ACCOUNT_TRANSITIONS[courier.accountStatus] ?? []) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      side
      size="lg"
      title={courier ? [courier.givenNames, courier.familyNames].filter(Boolean).join(" ") : t("detailTitle")}
      description={courier ? formatPhone(courier.phone) : undefined}
    >
      {loading && !courier && (
        <div className="grid h-40 place-items-center">
          <Loader2 className="size-6 animate-spin text-ink/40" aria-label={t("loading")} />
        </div>
      )}
      {error && !courier ? <Alert>{errorMessage(error)}</Alert> : null}
      {courier && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <VerificationBadge status={courier.verificationStatus} />
            <AccountStatusBadge status={courier.accountStatus} />
          </div>

          {justCreated && courier.verificationStatus === "PENDING" && <Alert tone="success">{t("createdNotice")}</Alert>}
          {!justCreated && courier.verificationStatus === "PENDING" && <Alert tone="info">{t("pendingNotice")}</Alert>}

          {(verificationActions.length > 0 || accountActions.length > 0) && (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink/45">{t("actions")}</p>
              <div className="flex flex-wrap gap-2">
                {verificationActions.map((to) => (
                  <Button key={to} size="sm" variant={DESTRUCTIVE.has(to) ? "outline" : "primary"} onClick={() => setPending({ kind: "verification", to })}>
                    {t(`verificationAction.${to}`)}
                  </Button>
                ))}
                {accountActions.map((to) => (
                  <Button key={to} size="sm" variant={DESTRUCTIVE.has(to) ? "outline" : "dark"} className={DESTRUCTIVE.has(to) ? "text-red-600" : ""} onClick={() => setPending({ kind: "account", to })}>
                    {t(`accountAction.${to}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Block icon={<CircleUserRound className="size-4" />} title={t("sectionPerson")}>
            <Item label={t("document")}>
              {courier.documentType ? `${td.has(courier.documentType) ? td(courier.documentType) : courier.documentType} ${courier.documentNumber}` : "—"}
            </Item>
            {municipalities && can(viewer, PERMISSIONS.MANAGE_COURIERS) ? (
              <MunicipalityEditor key={courier.userId} courier={courier} municipalities={municipalities} onChanged={onChanged} />
            ) : (
              <Item label={t("municipality")}>{courier.municipality?.name ?? "—"}</Item>
            )}
            <Item label={t("fundingMode")}>{courier.fundingMode ? tc(`fundingModes.${courier.fundingMode}`) : "—"}</Item>
            <Item label={t("createdAt")}>{format.dateTime(new Date(courier.createdAt), { dateStyle: "medium" })}</Item>
          </Block>

          <Block icon={<Bike className="size-4" />} title={t("sectionVehicle")}>
            <Item label={t("vehicleType")}>{courier.vehicle ? tc(`vehicleTypes.${courier.vehicle.type}`) : "—"}</Item>
            {courier.vehicle?.plate && (
              <Item label={t("plate")}>
                <span className="rounded-md bg-brand px-2 py-0.5 font-mono font-bold">{courier.vehicle.plate}</span>
              </Item>
            )}
            {courier.vehicleDescription && <Item label={t("vehicleDescription")}>{courier.vehicleDescription}</Item>}
          </Block>

          <Block icon={<CreditCard className="size-4" />} title={t("sectionAccounts")}>
            {courier.collectionAccounts.length === 0 ? (
              <p className="text-sm text-ink/50">{t("noAccounts")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {courier.collectionAccounts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-ink/8 p-3 text-sm">
                    <p className="font-semibold">
                      {tc(`paymentMethods.${a.paymentMethod}`)}
                      {a.bank && <span className="font-normal text-ink/55"> · {a.bank}{a.bankAccountType && ` · ${tc(`bankAccountTypes.${a.bankAccountType}`)}`}</span>}
                    </p>
                    <p className="font-mono text-ink/80">{a.accountNumber}</p>
                    <p className="text-xs text-ink/50">{a.holderName}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block icon={<Clock3 className="size-4" />} title={t("history")}>
            <ol className="relative flex flex-col gap-4 border-l-2 border-ink/8 pl-5">
              {courier.verificationHistory.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-ink" aria-hidden />
                  <p className="text-sm font-semibold">{h.from ? `${tv(h.from)} → ${tv(h.to)}` : tv(h.to)}</p>
                  {h.reason && <p className="text-sm text-ink/60">“{h.reason}”</p>}
                  <p className="text-xs text-ink/45">
                    {format.dateTime(new Date(h.changedAt), { dateStyle: "medium", timeStyle: "short" })}
                    {h.changedBy && ` · ${h.changedBy}`}
                  </p>
                </li>
              ))}
            </ol>
          </Block>
        </div>
      )}

      {pending && courier && (
        <StatusChangeDialog
          open
          title={pending.kind === "verification" ? t(`verificationAction.${pending.to}`) : t(`accountAction.${pending.to}`)}
          body={pending.kind === "verification" ? t(`verificationConfirm.${pending.to}`, { name: courier.givenNames }) : t(`accountConfirm.${pending.to}`, { name: courier.givenNames, status: ts(pending.to) })}
          confirmLabel={t("confirm")}
          destructive={DESTRUCTIVE.has(pending.to)}
          onClose={() => setPending(null)}
          onConfirm={apply}
        />
      )}
    </Dialog>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink/45">
        {icon} {title}
      </h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** El municipio decide en qué despacho aparece: si quedó mal al registrarlo, aquí se corrige. */
function MunicipalityEditor({
  courier,
  municipalities,
  onChanged,
}: {
  courier: CourierDetail;
  municipalities: IdentityOptions["municipalities"];
  onChanged: (courier: CourierDetail) => void;
}) {
  const t = useTranslations("couriers");
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | "">(courier.municipality?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const current = municipalities.find((m) => m.id === courier.municipality?.id);

  const save = async () => {
    if (value === "" || value === courier.municipality?.id) return setEditing(false);
    setBusy(true);
    setError(null);
    try {
      onChanged(await container.admin.changeCourierMunicipality(courier.userId, value));
      setEditing(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-ink/55">{t("municipality")}</span>
          <span className="flex items-baseline gap-2 text-right font-medium">
            {courier.municipality?.name ?? "—"}
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-bold text-chonta-strong underline-offset-2 hover:underline">
              {t("changeMunicipality")}
            </button>
          </span>
        </div>
        {current && !current.launched && <Alert tone="info">{t("municipalityNotOperatingNotice", { name: current.name })}</Alert>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
      <MunicipalitySelect label={t("municipality")} municipalities={municipalities} value={value} onChange={setValue} />
      <p className="text-xs text-ink/55">{t("changeMunicipalityHint")}</p>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={save} loading={busy}>
          {t("saveMunicipality")}
        </Button>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-ink/55">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
