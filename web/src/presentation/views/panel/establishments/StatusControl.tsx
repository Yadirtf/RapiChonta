"use client";

import { DoorClosed, DoorOpen, PowerOff, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { AdminEstablishment } from "@/core/domain/entities/catalog-admin";
import type { EstablishmentStatus } from "@/core/domain/entities/establishment";
import { container } from "@/infrastructure/di/container";
import { EstablishmentStatusSign } from "../../../components/catalog/EstablishmentStatus";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { useErrorMessage } from "../../../hooks/useErrorMessage";

const ICONS: Record<EstablishmentStatus, typeof DoorOpen> = { ACTIVE: DoorOpen, TEMPORARILY_CLOSED: DoorClosed, INACTIVE: PowerOff, DRAFT: Rocket };

/** Cambios de estado permitidos (establishment_status_transitions). Dar de baja pide confirmación. */
export function StatusControl({ establishment, onChanged }: { establishment: AdminEstablishment; onChanged: (e: AdminEstablishment) => void }) {
  const t = useTranslations("establishmentEditor.status");
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState<EstablishmentStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);

  const change = async (to: EstablishmentStatus) => {
    setBusy(to);
    setError(null);
    try {
      onChanged(await container.catalogAdmin.changeEstablishmentStatus(establishment.id, to));
      setConfirming(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const actionKey = (to: EstablishmentStatus) => (to === "ACTIVE" && establishment.status === "DRAFT" ? "publish" : to);

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 hidden sm:inline">
          <EstablishmentStatusSign status={establishment.status} />
        </span>
        {establishment.allowedTransitions.map((to) => {
          const Icon = ICONS[to];
          return (
            <Button
              key={to}
              size="sm"
              variant={to === "ACTIVE" ? "primary" : to === "INACTIVE" ? "ghost" : "outline"}
              loading={busy === to}
              disabled={!!busy}
              onClick={() => (to === "INACTIVE" ? setConfirming(true) : void change(to))}
            >
              <Icon className="size-4" aria-hidden /> {t(`actions.${actionKey(to)}`)}
            </Button>
          );
        })}
      </div>
      {error && !confirming ? <Alert className="max-w-md">{errorMessage(error)}</Alert> : null}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={t("deactivateTitle")} description={t("deactivateBody", { name: establishment.name })} closeLabel={t("cancel")}>
        <div className="flex flex-col gap-2 pt-2">
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          <Button variant="danger" size="lg" block loading={busy === "INACTIVE"} onClick={() => void change("INACTIVE")}>
            {t("actions.INACTIVE")}
          </Button>
          <Button variant="ghost" block onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
