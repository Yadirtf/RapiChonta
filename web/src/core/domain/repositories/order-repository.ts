import type {
  AdjustmentDecision,
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
  SubstituteOption,
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
  /** "Ya lo recibí": cierra la entrega y libera al domiciliario. */
  confirmReceived(code: string): Promise<void>;
  /** "No lo recibí", después de una entrega con foto: abre un caso con lo que cuente el cliente. */
  reportNotReceived(code: string, description?: string): Promise<void>;
  /** E09: productos del mismo local para cambiar el que falta (primero los parecidos). */
  substitutes(code: string, adjustmentId: string, language: string): Promise<SubstituteOption[]>;
  /** E09: la decisión sobre una línea; cancelar responde por toda la pregunta. */
  decideAdjustment(code: string, adjustmentId: string, input: { decision: AdjustmentDecision; productVersionId?: string }): Promise<void>;

  addresses(): Promise<SavedAddress[]>;
  /** A dónde fue el último pedido (puede ser un punto sin nombre); null si aún no ha pedido. */
  lastAddress(): Promise<SavedAddress | null>;
  archiveAddress(id: string): Promise<void>;
  makeDefaultAddress(id: string): Promise<void>;
  recipients(): Promise<SavedRecipient[]>;
  archiveRecipient(id: string): Promise<void>;
}
