import type { CashBoard, CashBoxDetail } from "@/core/domain/entities/cash";
import type { CashRepository } from "@/core/domain/repositories/cash-repository";
import { apiRequest } from "../http/api-client";

const id = encodeURIComponent;

export class HttpCashRepository implements CashRepository {
  board(input: Parameters<CashRepository["board"]>[0]) {
    return apiRequest<CashBoard>("GET", "/cash/boxes", { query: input });
  }

  detail(boxId: string) {
    return apiRequest<CashBoxDetail>("GET", `/cash/boxes/${id(boxId)}`);
  }

  open(input: Parameters<CashRepository["open"]>[0]) {
    return apiRequest<{ boxId: string }>("POST", "/cash/boxes/open", {
      body: input,
    });
  }

  async adjust(boxId: string, input: Parameters<CashRepository["adjust"]>[1]) {
    await apiRequest<unknown>("POST", `/cash/boxes/${id(boxId)}/adjustments`, {
      body: input,
    });
  }

  close(boxId: string, input: Parameters<CashRepository["close"]>[1]) {
    return apiRequest<{ difference: string }>("POST", `/cash/boxes/${id(boxId)}/close`, { body: input });
  }
}
