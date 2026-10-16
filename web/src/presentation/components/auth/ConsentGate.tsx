"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Account } from "@/core/domain/entities/account";
import { container } from "@/infrastructure/di/container";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ConsentChecklist } from "./ConsentChecklist";

/**
 * Documentos legales pendientes (versión nueva, o rol nuevo como el de domiciliario): la sesión
 * no sigue hasta aceptarlos. La alternativa es salir.
 */
export function ConsentGate({ account, onAccepted, onSignOut }: { account: Account; onAccepted: (a: Account) => void; onSignOut: () => void }) {
  const t = useTranslations("consents");
  const errorMessage = useErrorMessage();
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = account.pendingConsents;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      onAccepted(await container.account.acceptConsents([...accepted]));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open dismissible={false} title={t("gateTitle", { name: account.givenNames })} description={t("gateSubtitle")}>
      <div className="flex flex-col gap-4">
        <ConsentChecklist
          documents={pending}
          accepted={accepted}
          disabled={busy}
          onToggle={(id) =>
            setAccepted((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Button size="lg" block loading={busy} disabled={pending.some((d) => !accepted.has(d.id))} onClick={accept}>
          {t("continue")}
        </Button>
        <Button variant="ghost" block onClick={onSignOut} disabled={busy}>
          {t("signOutInstead")}
        </Button>
      </div>
    </Dialog>
  );
}
