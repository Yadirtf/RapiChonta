"use client";

import { Reorder, useDragControls } from "framer-motion";
import { Eye, EyeOff, GripVertical, ImagePlus, Wallet, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { AdminPaymentOption } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { ImageUploadButton } from "../../../components/catalog/ImageUploadButton";
import { PaymentMark } from "../../../components/orders/orderVisuals";
import { EmptyState, PageHeader } from "../../../components/panel/PageHeader";
import { Alert } from "../../../components/ui/Alert";
import { useErrorMessage } from "../../../hooks/useErrorMessage";
import { useResource } from "../../../hooks/useResource";

/**
 * "¿Cómo pagas al recibir?" desde el panel: qué medios ven los clientes, en qué orden y con qué imagen.
 * Qué es cada medio (efectivo o cuenta del domiciliario) lo define el sistema. Ocultar uno no cambia los
 * pedidos hechos ni el cobro del domiciliario: solo deja de ofrecerse al pagar.
 */
export function PaymentMethodsView() {
  const t = useTranslations("paymentsAdmin");
  const errorMessage = useErrorMessage();
  const list = useResource(() => container.businessAdmin.paymentOptions(), []);
  const latest = useRef<AdminPaymentOption[] | null>(null);
  latest.current = list.data;
  const [error, setError] = useState<unknown>(null);

  /** Cada cambio devuelve la lista completa: si falla, se recarga para no mostrar algo que no quedó guardado. */
  const attempt = async (action: () => Promise<AdminPaymentOption[]>) => {
    setError(null);
    try {
      list.setData(await action());
    } catch (e) {
      setError(e);
      await list.reload();
    }
  };

  const patch = (code: string, change: Partial<AdminPaymentOption>) =>
    list.setData(latest.current!.map((o) => (o.code === code ? { ...o, ...change } : o)));

  const toggle = (o: AdminPaymentOption) => {
    patch(o.code, { offered: !o.offered });
    void attempt(() => container.businessAdmin.updatePaymentOption(o.code, { offered: !o.offered }));
  };

  const setImage = (o: AdminPaymentOption, fileId: string | null, previewUrl: string | null) => {
    patch(o.code, { imageFileId: fileId, imageUrl: previewUrl });
    void attempt(() => container.businessAdmin.updatePaymentOption(o.code, { imageFileId: fileId }));
  };

  const offered = list.data?.filter((o) => o.offered) ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error || list.error ? <Alert>{errorMessage(error ?? list.error)}</Alert> : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-3">
          {list.loading && !list.data ? (
            <div className="flex flex-col gap-2.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl bg-white" />
              ))}
            </div>
          ) : list.data?.length === 0 ? (
            <EmptyState icon={<Wallet className="size-7" />} title={t("emptyTitle")} />
          ) : (
            list.data && (
              <Reorder.Group axis="y" values={list.data} onReorder={list.setData} className="flex flex-col gap-2.5">
                {list.data.map((o, index) => (
                  <MethodRow
                    key={o.code}
                    option={o}
                    position={index + 1}
                    lastOffered={o.offered && offered.length === 1}
                    onToggle={() => toggle(o)}
                    onImage={(fileId, url) => setImage(o, fileId, url)}
                    onError={setError}
                    onDragEnd={() => void attempt(() => container.businessAdmin.reorderPaymentOptions(latest.current!.map((x) => x.code)))}
                  />
                ))}
              </Reorder.Group>
            )
          )}
          <p className="text-sm text-ink/50">{t("orderHint")}</p>
        </section>

        <CustomerPreview options={offered} />
      </div>
    </div>
  );
}

function MethodRow({ option: o, position, lastOffered, onToggle, onImage, onError, onDragEnd }: {
  option: AdminPaymentOption;
  position: number;
  lastOffered: boolean;
  onToggle: () => void;
  onImage: (fileId: string | null, previewUrl: string | null) => void;
  onError: (error: unknown) => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("paymentsAdmin");
  const tp = useTranslations("payment");
  const controls = useDragControls();
  const name = tp.has(o.code) ? tp(o.code) : o.code;
  const kind = !o.isAccountBased ? "cash" : o.requiresBank ? "bank" : "wallet";

  return (
    <Reorder.Item
      value={o}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={`relative flex items-center gap-3 rounded-3xl p-3 pr-4 shadow-sm ring-1 transition-colors sm:gap-4 ${
        o.offered ? "bg-white ring-ink/5" : "bg-surface ring-ink/10 [background-image:repeating-linear-gradient(135deg,transparent_0_12px,rgb(20_18_31/0.03)_12px_24px)]"
      }`}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="grid h-12 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-ink/30 hover:bg-ink/5 hover:text-ink active:cursor-grabbing"
        aria-label={t("drag", { name })}
        title={t("drag", { name })}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>

      <div className="relative shrink-0">
        <ImageUploadButton
          purpose="PAYMENT_METHOD_IMAGE"
          label={o.imageUrl ? t("changeImage", { name }) : t("addImage", { name })}
          onUploaded={(fileId, url) => onImage(fileId, url)}
          onError={onError}
          className={`group size-16 rounded-[20px] ${o.imageUrl ? "" : "border-2 border-dashed border-ink/15 hover:border-chonta/60"}`}
        >
          <span className="relative">
            <PaymentMark option={o} size="lg" />
            <span className="absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-ink text-brand opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImagePlus className="size-3.5" aria-hidden />
            </span>
          </span>
        </ImageUploadButton>
        {o.imageFileId && (
          <button
            type="button"
            onClick={() => onImage(null, null)}
            aria-label={t("removeImage", { name })}
            title={t("removeImage", { name })}
            className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-white shadow"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-display text-lg font-extrabold leading-tight">{name}</span>
          <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold tabular-nums text-chonta" title={t("positionTitle")}>
            {t("position", { position })}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-ink/55">{t(`kind.${kind}`)}</p>
        {!o.offered && <p className="mt-1 text-xs font-medium text-ink/50">{t("hiddenHint")}</p>}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          role="switch"
          aria-checked={o.offered}
          onClick={onToggle}
          disabled={lastOffered}
          aria-label={t("offeredLabel", { name })}
          title={lastOffered ? t("lastOffered") : undefined}
          className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${o.offered ? "bg-leaf" : "bg-ink/15"}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${o.offered ? "left-6" : "left-1"}`} aria-hidden />
        </button>
        <span className={`hidden items-center gap-1 text-[11px] font-semibold sm:flex ${o.offered ? "text-leaf" : "text-ink/45"}`}>
          {o.offered ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
          {o.offered ? t("offered") : t("hidden")}
        </span>
      </div>
    </Reorder.Item>
  );
}

/** Réplica de "¿Cómo pagas al recibir?" con los medios visibles, para ver el cambio antes de que llegue un cliente. */
function CustomerPreview({ options }: { options: AdminPaymentOption[] }) {
  const t = useTranslations("paymentsAdmin");
  const tp = useTranslations("payment");
  return (
    <aside className="lg:sticky lg:top-8" aria-label={t("previewTitle")}>
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-chonta">{t("previewTitle")}</p>
      <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_40px_-24px_rgb(20_18_31/0.45)] ring-1 ring-ink/5">
        <div className="awning awning-sm h-4" aria-hidden />
        <div className="flex flex-col gap-3 px-5 pb-5 pt-6">
          <p className="flex items-center gap-2 font-display text-lg font-extrabold">
            <span className="grid size-7 place-items-center rounded-full bg-ink text-sm text-brand">3</span>
            {t("previewStep")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <div key={o.code} className="flex flex-col items-start gap-2.5 rounded-2xl border-2 border-ink/10 bg-white p-3">
                <PaymentMark option={o} />
                <span className="font-display text-sm font-extrabold">{tp.has(o.code) ? tp(o.code) : o.code}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink/45">{t("previewHint")}</p>
        </div>
      </div>
    </aside>
  );
}
