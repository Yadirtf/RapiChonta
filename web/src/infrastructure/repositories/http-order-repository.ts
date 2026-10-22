import type { MyOrdersPage, OrderDetail, OrderQuote, PaymentMethodCode, SavedAddress, SavedRecipient, SubstituteOption } from "@/core/domain/entities/order";
import type { OrderRepository, PlaceOrderInput } from "@/core/domain/repositories/order-repository";
import { apiGet, apiRequest } from "../http/api-client";

const id = (value: string) => encodeURIComponent(value);

export class HttpOrderRepository implements OrderRepository {
  async paymentMethods() {
    return (await apiGet<{ code: PaymentMethodCode }[]>("/orders/payment-methods")).map((m) => m.code);
  }

  quote(input: Parameters<OrderRepository["quote"]>[0], language: string) {
    return apiRequest<OrderQuote>("POST", "/orders/quote", { body: { ...input, lang: language } });
  }

  place(input: PlaceOrderInput, language: string) {
    return apiRequest<OrderDetail>("POST", "/orders", { body: { ...input, lang: language } });
  }

  mine(before?: string) {
    return apiRequest<MyOrdersPage>("GET", "/orders", { query: { before } });
  }

  find(code: string, language: string) {
    return apiRequest<OrderDetail>("GET", `/orders/${id(code)}`, { query: { lang: language } });
  }

  async confirmReceived(code: string) {
    await apiRequest<unknown>("POST", `/orders/${id(code)}/received`);
  }

  async reportNotReceived(code: string) {
    await apiRequest<unknown>("POST", `/orders/${id(code)}/not-received`);
  }

  async substitutes(code: string, adjustmentId: string, language: string) {
    const page = await apiRequest<{ items: SubstituteOption[] }>("GET", `/orders/${id(code)}/adjustments/${id(adjustmentId)}/substitutes`, { query: { lang: language } });
    return page.items;
  }

  async decideAdjustment(code: string, adjustmentId: string, input: Parameters<OrderRepository["decideAdjustment"]>[2]) {
    await apiRequest<unknown>("POST", `/orders/${id(code)}/adjustments/${id(adjustmentId)}/decision`, { body: input });
  }

  addresses() {
    return apiRequest<SavedAddress[]>("GET", "/me/addresses");
  }

  archiveAddress(addressId: string) {
    return apiRequest<void>("DELETE", `/me/addresses/${id(addressId)}`);
  }

  makeDefaultAddress(addressId: string) {
    return apiRequest<void>("PUT", `/me/addresses/${id(addressId)}/default`);
  }

  recipients() {
    return apiRequest<SavedRecipient[]>("GET", "/me/recipients");
  }

  archiveRecipient(recipientId: string) {
    return apiRequest<void>("DELETE", `/me/recipients/${id(recipientId)}`);
  }
}
