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
