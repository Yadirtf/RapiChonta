/** Un local que atiende el usuario del comercio, con lo justo para la cabecera del portal. */
export interface MerchantStore {
  id: string;
  name: string;
  status: string;
  /** Se puede abrir (ACTIVE) o pausar (TEMPORARILY_CLOSED) desde el portal; el resto es del panel. */
  acceptsOrders: boolean;
  logoFileId: string | null;
  municipality: { id: number; name: string; timeZone: string };
  partnership: { startedOn: string; endedOn: string | null };
  /** Pedidos esperando respuesta y en preparación: el número del distintivo de cada local. */
  waiting: number;
  preparing: number;
}

export interface CounterLine {
  name: string;
  quantity: number;
  notes: string | null;
  prepMinutes: number;
}

/** Un pedido en el mostrador del comercio. Del cliente, solo el nombre: el comercio no ve dirección ni teléfono. */
export interface CounterOrder {
  id: string;
  code: string;
  status: string;
  terminal: boolean;
  createdAt: Date;
  /** Cuándo salió del local (ON_THE_WAY), se entregó o se canceló. */
  closedAt: Date | null;
  acceptedAt: Date | null;
  preparationMinutes: number | null;
  estimatedReadyAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  customerName: string;
  customerNotes: string | null;
  lines: CounterLine[];
  itemsTotal: string;
  courier: { givenNames: string; phone: string | null } | null;
  cancellation: { reason: string; byMerchant: boolean } | null;
}

export interface MerchantActor {
  userId: string;
  role: string;
}

export type MerchantResult = { ok: true; status: string } | { ok: false; reason: 'NOT_FOUND' | 'STEP' | 'REASON' | 'MENU'; status?: string };

/**
 * El portal del comercio aliado (H15.1). Lee y cambia solo pedidos directos de los locales que el usuario atiende
 * (v_merchant_establishments); si no los atiende, la lectura vuelve nula y la acción NOT_FOUND.
 */
export abstract class MerchantDesk {
  abstract stores(userId: string): Promise<MerchantStore[]>;
  /** Lo que está en curso y lo cerrado en las últimas `closedHours` horas; nulo si el usuario no atiende el local. */
  abstract counter(userId: string, establishmentId: string, closedHours: number): Promise<CounterOrder[] | null>;
  /** Los motivos con que el comercio rechaza un pedido (is_merchant_reason). */
  abstract declineReasons(): Promise<string[]>;
  /**
   * Acepta con su tiempo, en una transacción: la aceptación, AWAITING_MERCHANT → PENDING_ASSIGNMENT con el rol
   * MERCHANT y el aviso al cliente ("{store} aceptó tu pedido").
   */
  abstract accept(actor: MerchantActor, code: string, preparationMinutes: number): Promise<MerchantResult>;
  /** Rechaza con su motivo: AWAITING_MERCHANT → CANCELLED (el cliente recibe el aviso de cancelado). */
  abstract decline(actor: MerchantActor, code: string, reason: string, notes: string | null): Promise<MerchantResult>;
  /** "Listo para recoger": una vez, con el pedido aceptado y sin recoger; avisa al domiciliario que lo lleva. */
  abstract markReady(actor: MerchantActor, code: string): Promise<MerchantResult>;
  /** Abre o pausa el local. Abrir exige al menos un producto pedible. */
  abstract setOpen(actor: MerchantActor, establishmentId: string, open: boolean): Promise<MerchantResult>;
}
