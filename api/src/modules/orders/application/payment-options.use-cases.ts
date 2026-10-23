import { Injectable } from '@nestjs/common';
import { Principal } from '../../identity/domain/principal';
import { OrderErrors } from '../domain/orders.errors';
import { PaymentOption, PaymentOptionPatch, PaymentOptionsRepository } from '../domain/ports/payment-options';

/** Lo que ve el cliente en "¿Cómo pagas al recibir?": los medios visibles, en el orden del panel, con su imagen. */
@Injectable()
export class ListPaymentMethodsUseCase {
  constructor(private readonly options: PaymentOptionsRepository) {}

  async execute(): Promise<PaymentOption[]> {
    return (await this.options.list()).filter((o) => o.offered);
  }
}

/**
 * Panel: qué medios contra entrega ven los clientes, en qué orden y con qué imagen. Qué es cada medio (efectivo
 * o cuenta, si pide banco) es del sistema y no se cambia aquí. Ocultar un medio no afecta los pedidos ya hechos
 * ni el cobro del domiciliario: solo deja de ofrecerse al pagar.
 */
@Injectable()
export class ManagePaymentOptionsUseCase {
  constructor(private readonly options: PaymentOptionsRepository) {}

  list(): Promise<PaymentOption[]> {
    return this.options.list();
  }

  async reorder(principal: Principal, codes: string[]): Promise<PaymentOption[]> {
    this.ensureGlobal(principal);
    const current = (await this.options.list()).map((o) => o.code);
    const same = codes.length === current.length && new Set(codes).size === codes.length && codes.every((c) => current.includes(c));
    if (!same) throw OrderErrors.paymentOrderMismatch();
    await this.options.reorder(codes, principal.userId);
    return this.options.list();
  }

  async update(principal: Principal, code: string, patch: PaymentOptionPatch): Promise<PaymentOption[]> {
    this.ensureGlobal(principal);
    if (patch.imageFileId && !(await this.options.isPaymentImage(patch.imageFileId))) throw OrderErrors.paymentImageNotUsable();
    const result = await this.options.update(code, patch, principal.userId);
    if (result === 'not_found') throw OrderErrors.paymentMethodNotFound();
    if (result === 'last_offered') throw OrderErrors.lastPaymentMethod();
    return this.options.list();
  }

  private ensureGlobal(principal: Principal): void {
    if (principal.municipalityId !== null) throw OrderErrors.paymentMethodsGlobalOnly();
  }
}
