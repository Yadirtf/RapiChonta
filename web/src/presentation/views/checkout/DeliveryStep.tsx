"use client";

import { Bike, Briefcase, Heart, Home, LocateFixed, MapPin, MapPinOff, PenLine, Plus, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import type { SavedAddress } from "@/core/domain/entities/order";
import { TextField } from "../../components/ui/Field";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useCoverage } from "../../hooks/useCoverage";
import { useGeolocation } from "../../hooks/useGeolocation";
import { MIN_REFERENCE, PLACE_LABELS, type CheckoutDraft, type PlaceLabel } from "./checkout-draft";
import { ChoiceChip } from "./StepCard";

// MapLibre pesa ~280 kB: se descarga cuando el cliente va a marcar un punto, no con la página.
const DeliveryPinMap = dynamic(() => import("../../components/map/DeliveryPinMap").then((m) => m.DeliveryPinMap), {
  ssr: false,
  loading: () => <div className="blueprint size-full animate-pulse" />,
});

export type ZoneState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "zone"; name: string; fee: string }
  /** `distanceMeters`: cuánto falta para llegar a la cobertura (la API lo calcula hasta el borde). */
  | { kind: "outside"; distanceMeters: number | null };

const LABEL_ICONS: Record<PlaceLabel, typeof Home> = { home: Home, work: Briefcase, family: Heart, custom: PenLine };

/** Ícono del lugar guardado por su nombre (Casa, Trabajo…); cualquier otro nombre lleva una etiqueta. */
export function placeIcon(label: string | null, labelText: (l: PlaceLabel) => string) {
  const match = PLACE_LABELS.find((l) => l !== "custom" && labelText(l).toLowerCase() === label?.toLowerCase());
  return match ? LABEL_ICONS[match] : label ? Tag : MapPin;
}

interface Props {
  draft: CheckoutDraft;
  onChange: (patch: Partial<CheckoutDraft>) => void;
  addresses: SavedAddress[];
  zone: ZoneState;
  store?: GeoPoint;
  showErrors: boolean;
}

/**
 * Paso 1 (H04.2): un lugar guardado con un toque, u otro punto marcado en el mapa con una referencia de
 * barrio ("casa azul frente al parque"), que es como se encuentra una puerta en Villagarzón.
 */
export function DeliveryStep({ draft, onChange, addresses, zone, store, showErrors }: Props) {
  const t = useTranslations("checkout");
  const labelText = (l: PlaceLabel) => t(`label${l[0].toUpperCase()}${l.slice(1)}` as "labelHome");
  const picking = !draft.savedAddressId;

  return (
    <div className="flex flex-col gap-4">
      {addresses.length > 0 && (
        <div role="radiogroup" aria-label={t("savedPlaces")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {addresses.map((address) => {
            const Icon = placeIcon(address.label, labelText);
            return (
              <ChoiceChip key={address.id} selected={draft.savedAddressId === address.id} onClick={() => onChange({ savedAddressId: address.id })} className="min-w-44 max-w-60 shrink-0">
                <Icon className="size-5 shrink-0 text-chonta" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate">{address.label}</span>
                  <span className="block truncate text-xs font-medium text-ink/55">{address.reference ?? address.line}</span>
                </span>
              </ChoiceChip>
            );
          })}
          <ChoiceChip selected={picking} onClick={() => onChange({ savedAddressId: null })} className="shrink-0">
            <Plus className="size-5 shrink-0 text-chonta" aria-hidden /> {t("otherPlace")}
          </ChoiceChip>
        </div>
      )}

      {picking ? (
        <PointPicker draft={draft} onChange={onChange} zone={zone} store={store} showErrors={showErrors} labelText={labelText} />
      ) : (
        <ZoneLine zone={zone} />
      )}
    </div>
  );
}

function PointPicker({ draft, onChange, zone, store, showErrors, labelText }: Omit<Props, "addresses"> & { labelText: (l: PlaceLabel) => string }) {
  const t = useTranslations("checkout");
  const { position, status, home } = useGeolocation();
  const coverage = useCoverage();
  const [focus, setFocus] = useState<{ point: GeoPoint; key: number }>({ point: draft.point ?? home, key: 0 });
  const touched = useRef(!!draft.point);

  // Si el cliente comparte su ubicación, el mapa arranca en su puerta (salvo que ya haya movido el pin).
  useEffect(() => {
    if (status === "loading" || touched.current) return;
    const start = status === "granted" ? position : home;
    setFocus((f) => ({ point: start, key: f.key + 1 }));
    onChange({ point: start });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToMe = () => {
    if (status !== "granted") return;
    setFocus((f) => ({ point: position, key: f.key + 1 }));
  };

  const pinLabel =
    zone.kind === "outside" ? (
      <span className="flex max-w-56 items-start gap-1.5 rounded-2xl bg-chonta-strong px-3 py-2 text-xs font-bold text-white shadow-lg">
        <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("outsideShort")}
      </span>
    ) : zone.kind === "zone" ? (
      <span className="price-tag whitespace-nowrap bg-ink py-1.5 pl-6 pr-3 text-xs font-extrabold text-brand shadow-lg [--tag-hole:var(--color-ink)]">
        {zone.name} · {zone.fee}
      </span>
    ) : (
      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink/60 shadow-lg">{t("checkingZone")}</span>
    );

  const referenceMissing = showErrors && draft.reference.trim().length < MIN_REFERENCE;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-72 overflow-hidden rounded-3xl ring-1 ring-ink/10 sm:h-80">
        <DeliveryPinMap
          focus={focus.point}
          focusKey={focus.key}
          store={store}
          coverage={coverage}
          label={pinLabel}
          onPick={(point) => {
            touched.current = true;
            onChange({ point });
          }}
          className="size-full"
        />
        <p className="pointer-events-none absolute inset-x-3 top-3 mx-auto w-fit rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-semibold text-ink/70 shadow">{t("mapHint")}</p>
        {status === "granted" && (
          <button
            type="button"
            onClick={goToMe}
            className="absolute bottom-3 left-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-bold shadow-lg outline-none transition hover:bg-cream focus-visible:ring-4 focus-visible:ring-brand/40"
          >
            <LocateFixed className="size-4 text-chonta" aria-hidden /> {t("useMyLocation")}
          </button>
        )}
      </div>
      {status === "denied" && <p className="text-xs text-ink/55">{t("locationDenied")}</p>}
      {zone.kind === "outside" && <OutsideNotice zone={zone} />}

      <TextField
        label={t("reference")}
        placeholder={t("referencePlaceholder")}
        hint={t("referenceHint")}
        value={draft.reference}
        maxLength={200}
        onChange={(e) => onChange({ reference: e.target.value })}
        error={referenceMissing ? t("missingReference") : null}
      />
      <TextField label={t("line")} placeholder={t("linePlaceholder")} value={draft.line} maxLength={200} onChange={(e) => onChange({ line: e.target.value })} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink/80">{t("saveAs")}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {PLACE_LABELS.map((label) => {
            const Icon = LABEL_ICONS[label];
            return (
              <ChoiceChip key={label} selected={draft.saveAs === label} onClick={() => onChange({ saveAs: label })} className="!py-2">
                <Icon className="size-4 text-chonta" aria-hidden /> {labelText(label)}
              </ChoiceChip>
            );
          })}
          <ChoiceChip selected={draft.saveAs === null} onClick={() => onChange({ saveAs: null })} className="!py-2">
            {t("dontSave")}
          </ChoiceChip>
        </div>
        {draft.saveAs === "custom" && (
          <TextField label={t("labelCustom")} placeholder={t("labelPlaceholder")} value={draft.customLabel} maxLength={40} onChange={(e) => onChange({ customLabel: e.target.value })} />
        )}
      </fieldset>
    </div>
  );
}

/** Con un lugar guardado basta decir a qué zona va y cuánto cuesta el domicilio. */
function ZoneLine({ zone }: { zone: ZoneState }) {
  const t = useTranslations("checkout");
  if (zone.kind === "outside") return <OutsideNotice zone={zone} />;
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-leaf/10 px-3.5 py-3 text-sm font-semibold text-leaf" role="status">
      <Bike className="size-4 shrink-0" aria-hidden />
      {zone.kind === "zone" ? t("zoneFee", { zone: zone.name, fee: zone.fee }) : t("checkingZone")}
    </p>
  );
}

/**
 * Fuera de cobertura: además de decirlo, cuánto falta ("a 600 m"), porque en un pueblo eso suele ser una
 * esquina más allá y el cliente puede mover el pin hasta donde lo encuentre el domiciliario.
 */
function OutsideNotice({ zone }: { zone: Extract<ZoneState, { kind: "outside" }> }) {
  const t = useTranslations("checkout");
  const format = useCatalogFormat();
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-chonta-soft px-3.5 py-3 text-sm font-semibold text-chonta-strong" role="status">
      <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {t("outsideZone")}
        {zone.distanceMeters !== null && zone.distanceMeters > 0 && <span className="mt-0.5 block font-bold">{t("outsideDistance", { distance: format.distance(zone.distanceMeters) })}</span>}
      </span>
    </p>
  );
}
