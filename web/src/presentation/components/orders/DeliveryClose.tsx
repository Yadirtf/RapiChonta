"use client";

import { Camera, CheckCircle2, MessageCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MAX_NOT_RECEIVED_DESCRIPTION, type OrderDetail } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldShell, inputClass } from "../ui/Field";

type Close = "received" | "notReceived";

/**
 * E10: el pase con el código de entrega. El cliente se lo dicta al domiciliario y con eso queda entregado; si
 * recibe otra persona, se lo manda por WhatsApp. "Ya lo recibí" sirve si el domiciliario no alcanzó a escribirlo.
 */
export function DeliveryCodePass({ order, onClosed }: { order: OrderDetail; onClosed: () => void }) {
  const t = useTranslations("orders");
  const code = order.delivery.code;
  if (!code) return null;
  const recipient = order.recipient;
  const text = t("codeShareText", { order: order.code, code });
  const phone = recipient?.phone?.replace(/\D/g, "");
  const whatsapp = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-brand p-5 text-ink sm:p-6" aria-labelledby="delivery-code-title">
      <p id="delivery-code-title" className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta-strong">
        {t("codeTitle")}
      </p>
      <div className="mt-3 flex gap-2.5" aria-label={code.split("").join(" ")} role="img">
        {code.split("").map((digit, i) => (
          <span
            key={i}
            className="grid h-16 w-14 place-items-center rounded-2xl bg-ink font-mono text-4xl font-extrabold text-brand shadow-[0_6px_0_rgb(20_18_31/0.25)] sm:h-[72px] sm:w-16"
            aria-hidden
          >
            {digit}
          </span>
        ))}
      </div>
      <p className="mt-4 max-w-md text-sm font-medium text-ink/75">{t("codeBody")}</p>
      {recipient && <p className="mt-2 text-sm font-bold">{t("codeForRecipient", { name: recipient.fullName })}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-ink/20 pt-4">
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-bold text-white transition hover:bg-ink/90"
        >
          <MessageCircle className="size-4" aria-hidden />
          {recipient && phone ? t("codeSendTo", { name: recipient.fullName.split(" ")[0] }) : t("codeShare")}
        </a>
        <CloseButton order={order} kind="received" onClosed={onClosed} className="!bg-white/60 hover:!bg-white" />
      </div>
    </section>
  );
}

/** E10: el domiciliario no recibió el código y dejó el pedido con foto. El cliente confirma o abre un caso. */
export function LeftWithPhoto({ order, time, onClosed }: { order: OrderDetail; time: (iso: string) => string; onClosed: () => void }) {
  const t = useTranslations("orders");
  const { proofUrl, reviewClosesAt } = order.delivery;
  return (
    <section className="overflow-hidden rounded-[28px] border-2 border-chonta/40 bg-white shadow-[0_12px_32px_-20px_rgb(20_18_31/0.35)]" aria-labelledby="left-title">
      <div className="flex items-start gap-3 p-5 sm:p-6">
        <span className="grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl bg-chonta text-white" aria-hidden>
          <Camera className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="left-title" className="font-display text-lg font-extrabold">
            {t("leftTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-ink/70">{t("leftBody")}</p>
        </div>
      </div>
      {proofUrl && (
        <figure className="receipt-edge mx-5 overflow-hidden rounded-b-2xl bg-cream p-3 pt-5 sm:mx-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada que vence: no pasa por el optimizador */}
          <img src={proofUrl} alt={t("leftPhotoAlt", { code: order.code })} className="mx-auto max-h-80 w-auto rounded-xl object-contain shadow-md" />
        </figure>
      )}
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        {reviewClosesAt && <p className="text-xs font-semibold text-ink/55">{t("leftAutoClose", { time: time(reviewClosesAt) })}</p>}
        <div className="flex flex-wrap gap-2">
          <CloseButton order={order} kind="received" onClosed={onClosed} />
          <CloseButton order={order} kind="notReceived" onClosed={onClosed} />
        </div>
      </div>
    </section>
  );
}

/** Botón con su confirmación: cerrar la entrega no se deshace. */
function CloseButton({ order, kind, onClosed, className = "" }: { order: OrderDetail; kind: Close; onClosed: () => void; className?: string }) {
  const t = useTranslations("orders");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [description, setDescription] = useState("");
  const received = kind === "received";

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await (received ? container.orders.confirmReceived(order.code) : container.orders.reportNotReceived(order.code, description));
      setOpen(false);
      onClosed();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={received ? "outline" : "ghost"} onClick={() => setOpen(true)} className={className}>
        {received ? <CheckCircle2 className="size-4 text-leaf" aria-hidden /> : <TriangleAlert className="size-4 text-chonta" aria-hidden />}
        {received ? t("receivedButton") : t("notReceivedButton")}
      </Button>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={received ? t("receivedConfirmTitle") : t("notReceivedConfirmTitle")}
        description={received ? t("receivedConfirmBody") : t("notReceivedConfirmBody")}
        closeLabel={t("close")}
      >
        {!received && (
          <FieldShell label={t("notReceivedWhat")} hint={t("notReceivedWhatHint")} className="mb-4">
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                value={description}
                maxLength={MAX_NOT_RECEIVED_DESCRIPTION}
                rows={3}
                placeholder={t("notReceivedWhatPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputClass} h-auto resize-none py-3`}
              />
            )}
          </FieldShell>
        )}
        {!!error && <Alert className="mb-4">{errorMessage(error)}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant={received ? "primary" : "dark"} loading={busy} onClick={() => void confirm()}>
            {received ? t("receivedConfirm") : t("notReceivedConfirm")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
