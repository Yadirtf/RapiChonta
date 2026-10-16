/**
 * Códigos de catálogo con comportamiento en el código (Docs/14-base-de-datos/README.md, "¿Entonces el código
 * nunca nombra un estado?"). La lista completa, el orden y las transiciones viven en la base de datos; aquí solo
 * están los códigos que el programa usa. Al arrancar, la API verifica que todos existan.
 */
export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  COURIER: 'COURIER',
  OPERATOR: 'OPERATOR',
  ADMIN: 'ADMIN',
} as const;
export type RoleCode = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_CODES = Object.values(ROLES);
/** Prioridad al elegir el rol de una sesión de personal cuando no se pide uno. */
export const STAFF_ROLE_PRIORITY: RoleCode[] = [ROLES.ADMIN, ROLES.OPERATOR, ROLES.COURIER];

export const USER_STATUSES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
  CLOSED: 'CLOSED',
} as const;
export type UserStatusCode = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

export const COURIER_VERIFICATION = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;
export type CourierVerificationCode = (typeof COURIER_VERIFICATION)[keyof typeof COURIER_VERIFICATION];

export const OTP_PURPOSES = { SIGN_IN: 'SIGN_IN', STAFF_SIGN_IN: 'STAFF_SIGN_IN', PHONE_CHANGE: 'PHONE_CHANGE' } as const;
export type OtpPurposeCode = (typeof OTP_PURPOSES)[keyof typeof OTP_PURPOSES];

export const OTP_CHANNELS = { SMS: 'SMS', WHATSAPP: 'WHATSAPP' } as const;
export type OtpChannelCode = (typeof OTP_CHANNELS)[keyof typeof OTP_CHANNELS];

export const AUTH_FACTORS = { OTP: 'OTP', PASSWORD: 'PASSWORD' } as const;
export type AuthFactorCode = (typeof AUTH_FACTORS)[keyof typeof AUTH_FACTORS];

export const SESSION_END_REASONS = {
  SIGN_OUT: 'SIGN_OUT',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  ROLE_REVOKED: 'ROLE_REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type SessionEndReasonCode = (typeof SESSION_END_REASONS)[keyof typeof SESSION_END_REASONS];

export const PLATFORMS = { ANDROID: 'ANDROID', IOS: 'IOS', WEB: 'WEB' } as const;
export type PlatformCode = (typeof PLATFORMS)[keyof typeof PLATFORMS];

export const LANGUAGES = ['es', 'en'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

/** Permisos que el código verifica (role_permissions decide qué rol los tiene). */
export const PERMISSIONS = {
  ACCOUNT_MANAGE_OWN: 'account.manage_own',
  USERS_MANAGE_STAFF: 'users.manage_staff',
  COURIERS_MANAGE: 'couriers.manage',
  COURIERS_VERIFY: 'couriers.verify',
} as const;
export type PermissionCode = string;

/** Códigos que deben existir en cada catálogo para que la API arranque. */
export const REQUIRED_CATALOG_CODES: Record<string, readonly string[]> = {
  roles: ROLE_CODES,
  user_statuses: Object.values(USER_STATUSES),
  courier_verification_statuses: Object.values(COURIER_VERIFICATION),
  otp_purposes: Object.values(OTP_PURPOSES),
  otp_channels: Object.values(OTP_CHANNELS),
  auth_factors: Object.values(AUTH_FACTORS),
  session_end_reasons: Object.values(SESSION_END_REASONS),
  platforms: Object.values(PLATFORMS),
  data_request_types: ['DELETION'],
  data_request_statuses: ['COMPLETED'],
  audit_actions: ['USER_CREATED', 'USER_DEACTIVATED', 'ROLE_GRANTED', 'COURIER_VERIFIED'],
};
