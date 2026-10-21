"use client";

import { Clock3, KeyRound, ShoppingBasket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyCheckoutCorrections, checkoutItems, type Cart } from "@/core/domain/entities/cart";
import { toCents } from "@/core/domain/entities/money";
import type { OrderQuote } from "@/core/domain/entities/order";
import { container } from "@/infrastructure/di/container";
import { isApiError, type ApiError } from "@/infrastructure/http/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { useBusiness, useOpeningText } from "../../business/BusinessProvider";
import { useCart } from "../../cart/CartProvider";
import { OpeningSign } from "../../components/business/OpeningSign";
import { DoorCard, StorePage } from "../../components/layout/StorePage";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { useCatalogFormat } from "../../hooks/useCatalogFormat";
import { useErrorMessage } from "../../hooks/useErrorMessage";
import { useDebounced, useResource } from "../../hooks/useResource";
import { courierNotes, deliveryChoice, draftProblems, emptyDraft, quoteDelivery, recipientChoice, type CheckoutDraft, type DraftProblem, type PlaceLabel } from "./checkout-draft";
import { CheckoutReceipt } from "./CheckoutReceipt";
import { DeliveryStep, type ZoneState } from "./DeliveryStep";
import { PaymentStep } from "./PaymentStep";
import { RecipientStep } from "./RecipientStep";
import { StepCard } from "./StepCard";

const STEP_OF: Record<DraftProblem, number> = { point: 1, reference: 1, recipient: 2, payment: 3 };

/**
 * Confirmar el pedido (H04.1–H04.2): dónde, quién recibe y cómo paga, con la comanda al lado. El ingreso
 * se pide recién aquí; la canasta sigue en el navegador hasta que la API acepta el pedido.
 */
export function CheckoutView() {
  const t = useTranslations("checkout");
  const { cart } = useCart();
  const { status, requestSignIn } = useAuth();

  if (!cart) {
    return (
      <Shell back="/">
        <DoorCard icon={<ShoppingBasket className="size-8" aria-hidden />} title={t("emptyTitle")} body={t("emptyBody")}>
          <Link href="/" className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand px-6 font-bold">
            {t("toMap")}
          </Link>
        </DoorCard>
      </Shell>
    );
  }
  if (status === "loading") return <Shell back={`/local/${cart.establishmentId}`}><CheckoutSkeleton /></Shell>;
  if (status === "anonymous") {
    return (
      <Shell back={`/local/${cart.establishmentId}`}>
        <DoorCard icon={<KeyRound className="size-8" aria-hidden />} title={t("signInTitle")} body={t("signInBody")}>
          <Button size="lg" onClick={() => void requestSignIn()}>
            {t("signIn")}
          </Button>
        </DoorCard>
      </Shell>
    );
  }
  return <Checkout cart={cart} />;
}

function Checkout({ cart }: { cart: Cart }) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const router = useRouter();
  const money = useCatalogFormat();
  const errorMessage = useErrorMessage();
  const { account } = useAuth();
  const { replace, setNotes } = useCart();
  const business = useBusiness();
  const opening = useOpeningText()(business.status);

  const book = useResource(
    () => Promise.all([container.orders.addresses(), container.orders.recipients(), container.orders.paymentMethods()]),
    [],
  );
  const store = useResource(() => container.establishments.findById(cart.establishmentId, { language: locale }), [cart.establishmentId, locale]);

  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [zone, setZone] = useState<ZoneState>({ kind: "idle" });
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [notice, setNotice] = useState<{ removed: string[]; repriced: string[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const clientRequestId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (book.data && !draft) setDraft(emptyDraft(book.data[0]));
  }, [book.data, draft]);

  const patch = useCallback((change: Partial<CheckoutDraft>) => {
    setDraft((d) => (d ? { ...d, ...change } : d));
    setPlaceError(null);
  }, []);

  /** La API dice qué productos cambiaron: la canasta se corrige y el cliente revisa antes de confirmar. */
  const correct = useCallback(
    (error: unknown) => {
      if (!isApiError(error, "PRODUCTS_UNAVAILABLE") && !isApiError(error, "PRODUCTS_CHANGED")) return false;
      const details = (error as ApiError).details ?? {};
      const result = applyCheckoutCorrections(cart, {
        unavailable: details.productIds as string[] | undefined,
        changed: details.changes as { productId: string; versionId: string; price: string }[] | undefined,
      });
      replace(result.cart);
      setNotice({ removed: result.removed, repriced: result.repriced });
      return true;
    },
    [cart, replace],
  );

  // Se cotiza al soltar el pin o cambiar la canasta; las notas de los productos no cambian el valor.
  const quoteKey = useDebounced(
    JSON.stringify({ delivery: draft ? quoteDelivery(draft) : null, items: checkoutItems(cart).map(({ productVersionId, quantity }) => ({ productVersionId, quantity })) }),
    350,
  );
  useEffect(() => {
    const { delivery, items } = JSON.parse(quoteKey) as { delivery: ReturnType<typeof quoteDelivery>; items: { productVersionId: string; quantity: number }[] };
    if (!delivery) return;
    let cancelled = false;
    setZone({ kind: "loading" });
    container.orders.quote({ establishmentId: cart.establishmentId, items, delivery }, locale).then(
      (next) => {
        if (cancelled) return;
        setQuote(next);
        setQuoteError(null);
        setZone({ kind: "zone", name: next.zone.name, fee: money.price(next.deliveryFee) });
      },
      (error) => {
        if (cancelled) return;
        if (isApiError(error, "NO_COVERAGE")) {
          const meters = error.details?.distanceMeters;
          setZone({ kind: "outside", distanceMeters: typeof meters === "number" ? meters : null });
          setQuoteError(null);
        } else if (!correct(error)) {
          setZone({ kind: "idle" });
          setQuoteError(error);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalCents = quote && zone.kind === "zone" ? toCents(quote.total) : null;
  const closed = opening?.tone === "closed" || store.data?.acceptsOrders === false;
  const blocked = closed || zone.kind !== "zone" || !quote || !!quote.newCustomerLimit?.exceeded;
  const problems = useMemo(() => (draft ? draftProblems(draft) : []), [draft]);

  const labelText = (l: PlaceLabel) => t(`label${l[0].toUpperCase()}${l.slice(1)}` as "labelHome");

  const submit = async () => {
    if (!draft || blocked) return;
    setShowErrors(true);
    if (problems.length) {
      document.getElementById(`step-${STEP_OF[problems[0]]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    try {
      const order = await container.orders.place(
        {
          establishmentId: cart.establishmentId,
          items: checkoutItems(cart),
          delivery: deliveryChoice(draft, labelText),
          recipient: recipientChoice(draft),
          paymentMethod: draft.payment!,
          notes: courierNotes(draft, (paysWith) => (paysWith === "exact" ? t("cashExactNote") : t("cashNote", { amount: money.cents(paysWith) }))),
          clientRequestId: clientRequestId.current,
        },
        locale,
      );
      // La canasta la vacía la página del pedido: vaciarla aquí mostraría "canasta vacía" mientras navega.
      router.push(`/pedidos/${order.code}?nuevo=1`);
    } catch (error) {
      if (!correct(error)) setPlaceError(errorMessage(error));
      setPlacing(false);
    }
  };

  const loading = book.loading && !book.data;
  const confirm = closed ? (
    // Fuera de horario el botón dice cuándo abrimos (RF-15); se puede dejar todo listo.
    <Button size="lg" block disabled variant="dark" className="!opacity-100">
      <Clock3 className="size-5 text-brand" aria-hidden /> {store.data?.acceptsOrders === false ? t("storeClosed") : opening?.detail}
    </Button>
  ) : (
    <Button size="lg" block onClick={submit} loading={placing} disabled={blocked || !draft}>
      {totalCents !== null ? t("confirm", { total: money.cents(totalCents) }) : t("confirmShort")}
    </Button>
  );

  return (
    <Shell back={`/local/${cart.establishmentId}`} aside={<OpeningSign />}>
      {loading || !draft ? (
        <CheckoutSkeleton />
      ) : book.error ? (
        <Alert className="mt-6">{errorMessage(book.error)}</Alert>
      ) : (
        <div className="mt-6 grid gap-6 pb-32 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:pb-12">
          <div className="flex min-w-0 flex-col gap-5">
            {notice && (
              <Alert tone="info">
                <p className="font-bold">{t("cartChanged")}</p>
                {notice.removed.length > 0 && <p>{t("removed", { names: notice.removed.join(", ") })}</p>}
                {notice.repriced.length > 0 && <p>{t("repriced", { names: notice.repriced.join(", ") })}</p>}
              </Alert>
            )}
            <StepCard number={1} title={t("stepWhere")} done={!problems.includes("point") && !problems.includes("reference") && zone.kind === "zone"}>
              <DeliveryStep draft={draft} onChange={patch} addresses={book.data![0]} zone={zone} store={store.data?.location} showErrors={showErrors} />
            </StepCard>
            <StepCard number={2} title={t("stepWho")} done={!problems.includes("recipient")}>
              <RecipientStep draft={draft} onChange={patch} recipients={book.data![1]} myPhone={account?.phone ?? null} showErrors={showErrors} />
            </StepCard>
            <StepCard number={3} title={t("stepPay")} done={!!draft.payment}>
              <PaymentStep draft={draft} onChange={patch} methods={book.data![2]} totalCents={totalCents} showErrors={showErrors} />
            </StepCard>
          </div>

          <aside className="lg:sticky lg:top-6">
            <CheckoutReceipt cart={cart} quote={quote} zone={zone} onNotes={setNotes}>
              {quoteError !== null && <Alert>{errorMessage(quoteError)}</Alert>}
              {placeError && <Alert>{placeError}</Alert>}
              <div className="hidden flex-col gap-2 lg:flex">{confirm}</div>
              <p className="text-center text-xs text-ink/50">{t("legal")}</p>
            </CheckoutReceipt>
          </aside>

          {/* En el celular el botón queda siempre a mano, sobre la canasta. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
            {confirm}
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Marco con el título "Tu pedido" y regreso al local (o al mapa). */
function Shell({ back, aside, children }: { back: string; aside?: ReactNode; children: ReactNode }) {
  const t = useTranslations("checkout");
  return (
    <StorePage back={back} backLabel={t("back")} title={t("title")} aside={aside}>
      {children}
    </StorePage>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" aria-busy>
      <div className="flex flex-col gap-5">
        <div className="h-96 animate-pulse rounded-[28px] bg-white" />
        <div className="h-36 animate-pulse rounded-[28px] bg-white" />
      </div>
      <div className="h-80 animate-pulse rounded-[28px] bg-white" />
    </div>
  );
}
