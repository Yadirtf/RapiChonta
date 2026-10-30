import type { AdjustmentDirection, CashBoard, CashBoxDetail } from "../entities/cash";

/** Puerto de las cajas del día (E11). Solo administradores; los ajustes piden cash.adjust. */
export interface CashRepository {
  board(input: { municipalityId?: number; date?: string }): Promise<CashBoard>;
  detail(boxId: string): Promise<CashBoxDetail>;
  open(input: { courierUserId: string; amount: string; paymentMethod: string; note?: string }): Promise<{ boxId: string }>;
  adjust(
    boxId: string,
    input: {
      note: string;
      reversesMovementId?: string;
      direction?: AdjustmentDirection;
      amount?: string;
    },
  ): Promise<void>;
  close(
    boxId: string,
    input: {
      received: { paymentMethod: string; amount: string }[];
      notes?: string;
    },
  ): Promise<{ difference: string }>;
}
