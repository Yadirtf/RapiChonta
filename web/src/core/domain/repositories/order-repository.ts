import type {
  CheckoutItem,
  DeliveryChoice,
  MyOrdersPage,
  OrderDetail,
  OrderQuote,
  PaymentMethodCode,
  QuoteDelivery,
  RecipientChoice,
  SavedAddress,
  SavedRecipient,
} from "../entities/order";

export interface PlaceOrderInput {
  establishmentId: string;
  items: CheckoutItem[];
  delivery: DeliveryChoice;
  paymentMethod: PaymentMethodCode;
  recipient: RecipientChoice;
  notes: string | null;
  /** UUID por intento de compra: reintentar no crea un segundo pedido. */
  clientRequestId: string;
}

/** Puerto del cliente para pedir y seguir sus pedidos (E04). */
export interface OrderRepository {
  paymentMethods(): Promise<PaymentMethodCode[]>;
  quote(input: { establishmentId: string; items: CheckoutItem[]; delivery: QuoteDelivery }, language: string): Promise<OrderQuote>;
  place(input: PlaceOrderInput, language: string): Promise<OrderDetail>;
  mine(before?: string): Promise<MyOrdersPage>;
  find(code: string, language: string): Promise<OrderDetail>;

  addresses(): Promise<SavedAddress[]>;
  archiveAddress(id: string): Promise<void>;
  makeDefaultAddress(id: string): Promise<void>;
  recipients(): Promise<SavedRecipient[]>;
  archiveRecipient(id: string): Promise<void>;
}
