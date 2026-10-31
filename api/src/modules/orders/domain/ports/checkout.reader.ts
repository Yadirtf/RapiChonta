import { ContentLanguage } from '../../../catalog/domain/catalog.codes';
import { CustomerExposure, MenuVersion } from '../checkout';

export interface OrderingEstablishment {
  id: string;
  name: string;
  municipalityId: number;
  /** El estado del local admite pedidos (ACTIVE; no TEMPORARILY_CLOSED ni DRAFT). */
  acceptsOrders: boolean;
  /**
   * Cómo se puede pedir hoy (E15), en el orden en que se sugieren: en un comercio aliado el pedido directo y la compra
   * por RapiChonta; en los demás solo la compra por RapiChonta.
   */
  fulfillmentModes: string[];
}

/** Lecturas para armar el pedido: el menú vigente, la exposición del cliente y la configuración del municipio. */
export abstract class CheckoutReader {
  abstract establishment(id: string): Promise<OrderingEstablishment | null>;
  /** Las versiones que envió el cliente, con la versión vigente de su producto y si hoy se puede pedir. */
  abstract menuVersions(versionIds: string[], language: ContentLanguage): Promise<MenuVersion[]>;
  abstract exposure(customerUserId: string): Promise<CustomerExposure>;
  /** Tope vigente para clientes nuevos en el municipio (texto decimal), o null si no hay. */
  abstract newCustomerLimit(municipalityId: number): Promise<string | null>;
  /** Versión vigente de la comisión del municipio; null si el administrador no la ha configurado. */
  abstract commissionRateId(municipalityId: number): Promise<string | null>;
  /** Medios de pago contra entrega que hoy ve el cliente (los visibles en el panel), en su orden. */
  abstract paymentMethods(): Promise<string[]>;
}
