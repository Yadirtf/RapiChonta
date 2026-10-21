/** Códigos de rol del catálogo `roles` (la API los verifica al arrancar). */
export type RoleCode = "CUSTOMER" | "COURIER" | "OPERATOR" | "ADMIN";
export type UserStatusCode = "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "CLOSED";
export type LegalDocumentType = "TERMS_OF_SERVICE" | "DATA_PROCESSING_POLICY" | "COURIER_LOCATION_AUTHORIZATION";

export const STAFF_ROLES: readonly RoleCode[] = ["OPERATOR", "ADMIN"];

/** Permisos que la web usa para mostrar u ocultar opciones (la API los vuelve a verificar). */
export const PERMISSIONS = {
  MANAGE_STAFF: "users.manage_staff",
  MANAGE_COURIERS: "couriers.manage",
  VERIFY_COURIERS: "couriers.verify",
  MANAGE_ESTABLISHMENTS: "establishments.manage",
  MANAGE_PRODUCTS: "products.manage",
  MANAGE_CATEGORIES: "categories.manage",
  MANAGE_ZONES: "zones.manage",
  MANAGE_HOURS: "hours.manage",
  MANAGE_SETTINGS: "settings.manage",
  MANAGE_COMMISSION: "commission.manage",
  MANAGE_MUNICIPALITIES: "municipalities.manage",
  ASSIGN_ORDERS: "orders.assign",
  READ_AUDIT: "audit.read",
} as const;

export interface LegalDocumentVersion {
  id: string;
  documentType: LegalDocumentType;
  versionLabel: string;
}

/** Lo que la API devuelve del usuario autenticado (GET /me). */
export interface Account {
  userId: string;
  givenNames: string;
  familyNames: string | null;
  phone: string | null;
  language: string;
  /** Moneda del precio aproximado (H03.4); null = solo pesos. */
  displayCurrency: "USD" | "EUR" | null;
  roles: RoleCode[];
  activeRole: RoleCode;
  permissions: string[];
  pendingConsents: LegalDocumentVersion[];
}

export const fullName = (a: { givenNames: string; familyNames: string | null }) =>
  [a.givenNames, a.familyNames].filter(Boolean).join(" ");

export const can = (account: Account | null, permission: string) => !!account?.permissions.includes(permission);

export const isStaffSession = (account: Account | null) => !!account && STAFF_ROLES.includes(account.activeRole);

/** Requiere contraseña: personal y domiciliarios (roles.requires_password). */
export const usesPassword = (account: Account) => account.roles.some((r) => r !== "CUSTOMER");
