import type { DeskBoardSnapshot, DeskOrderDetail } from "@/core/domain/entities/desk";
import type { DeskRepository } from "@/core/domain/repositories/desk-repository";
import { apiRequest, resolveApiAsset } from "../http/api-client";

const id = encodeURIComponent;

export class HttpDeskRepository implements DeskRepository {
  board(municipalityId?: number) {
    return apiRequest<DeskBoardSnapshot>("GET", "/desk/orders", { query: { municipalityId } });
  }

  async detail(code: string) {
    const order = await apiRequest<DeskOrderDetail>("GET", `/desk/orders/${id(code)}`);
    return {
      ...order,
      proof: order.proof && { ...order.proof, url: resolveApiAsset(order.proof.url) },
      purchase: order.purchase && { ...order.purchase, receiptUrl: resolveApiAsset(order.purchase.receiptUrl) },
    };
  }

  async cancellationReasons() {
    return (await apiRequest<{ reasons: string[] }>("GET", "/desk/cancellation-reasons")).reasons;
  }

  async cancel(code: string, input: Parameters<DeskRepository["cancel"]>[1]) {
    await apiRequest<unknown>("POST", `/desk/orders/${id(code)}/cancel`, { body: input });
  }

  async reviewProof(code: string, input: Parameters<DeskRepository["reviewProof"]>[1]) {
    await apiRequest<unknown>("POST", `/desk/orders/${id(code)}/proof-review`, { body: input });
  }

  async takeIncident(incidentId: string) {
    await apiRequest<unknown>("POST", `/desk/incidents/${id(incidentId)}/take`);
  }

  async resolveIncident(incidentId: string, input: Parameters<DeskRepository["resolveIncident"]>[1]) {
    await apiRequest<unknown>("POST", `/desk/incidents/${id(incidentId)}/resolve`, { body: input });
  }
}
