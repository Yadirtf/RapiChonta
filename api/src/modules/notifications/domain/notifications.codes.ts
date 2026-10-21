/**
 * Códigos de catálogo del módulo de notificaciones (Docs/14-base-de-datos/E06-notificaciones.md).
 * Qué estados del pedido avisan al cliente no está aquí: lo dice order_statuses.notifies_customer.
 */
export const PUSH_PROVIDERS = {
  /** Firebase Cloud Messaging: Android con Google Play Services e iOS (vía APNs). */
  FCM: 'FCM',
  /** Huawei Push Kit: teléfonos Huawei sin Google (HMS Core). */
  HMS: 'HMS',
} as const;
export type PushProviderCode = (typeof PUSH_PROVIDERS)[keyof typeof PUSH_PROVIDERS];

export const NOTIFICATION_TYPES = {
  ORDER_OFFERED: 'ORDER_OFFERED',
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  PREPARATION_TIME_REACHED: 'PREPARATION_TIME_REACHED',
  ADJUSTMENT_REQUESTED: 'ADJUSTMENT_REQUESTED',
  ADJUSTMENT_RESOLVED: 'ADJUSTMENT_RESOLVED',
  INCIDENT_OPENED: 'INCIDENT_OPENED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
  DELIVERY_PROOF_PENDING: 'DELIVERY_PROOF_PENDING',
} as const;
export type NotificationTypeCode = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const DELIVERY_STATUSES = { QUEUED: 'QUEUED', SENT: 'SENT', FAILED: 'FAILED' } as const;

export const TOKEN_INVALIDATION_REASONS = {
  /** La app registró otro token para el mismo proveedor en ese dispositivo. */
  REPLACED: 'REPLACED',
  /** Se cerró la sesión en el dispositivo. */
  SIGNED_OUT: 'SIGNED_OUT',
  /** El proveedor respondió que el token ya no existe (app desinstalada, datos borrados). */
  REJECTED_BY_PROVIDER: 'REJECTED_BY_PROVIDER',
} as const;
export type TokenInvalidationReason = (typeof TOKEN_INVALIDATION_REASONS)[keyof typeof TOKEN_INVALIDATION_REASONS];

/** Códigos que deben existir para que la API arranque (se verifican al iniciar). */
export const REQUIRED_NOTIFICATION_CODES: Record<string, readonly string[]> = {
  push_providers: Object.values(PUSH_PROVIDERS),
  notification_types: [NOTIFICATION_TYPES.ORDER_STATUS_CHANGED],
  notification_delivery_statuses: Object.values(DELIVERY_STATUSES),
  push_token_invalidation_reasons: Object.values(TOKEN_INVALIDATION_REASONS),
};
