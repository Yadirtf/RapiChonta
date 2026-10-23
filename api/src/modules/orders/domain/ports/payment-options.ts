/** Un medio contra entrega tal como lo configura el panel para "¿Cómo pagas al recibir?". */
export interface PaymentOption {
  /** Código de payment_methods (CASH, NEQUI, ...). */
  code: string;
  /** El dinero entra a una cuenta (no es efectivo): el domiciliario muestra su QR o su número. */
  isAccountBased: boolean;
  requiresBank: boolean;
  /** El cliente lo ve al pagar. Oculto, el domiciliario igual puede cobrar con él si el cliente cambia de idea. */
  offered: boolean;
  imageFileId: string | null;
}

export interface PaymentOptionPatch {
  offered?: boolean;
  /** null quita la imagen; undefined no la cambia. */
  imageFileId?: string | null;
}

/** checkout_payment_methods: orden, visibilidad e imagen de cada medio contra entrega. */
export abstract class PaymentOptionsRepository {
  /** Todos los medios contra entrega activos, en el orden del panel. */
  abstract list(): Promise<PaymentOption[]>;
  /** El nuevo orden; `codes` trae todos los medios de list(). */
  abstract reorder(codes: string[], actorUserId: string): Promise<void>;
  /**
   * Cambia un medio dentro de una transacción que bloquea la lista, para que dos administradores no puedan
   * ocultar a la vez los dos últimos medios visibles. `last_offered`: el cliente quedaría sin ninguno.
   */
  abstract update(code: string, patch: PaymentOptionPatch, actorUserId: string): Promise<'updated' | 'not_found' | 'last_offered'>;
  /** El archivo existe y se subió como PAYMENT_METHOD_IMAGE. */
  abstract isPaymentImage(fileId: string): Promise<boolean>;
}
