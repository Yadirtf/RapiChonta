/**
 * Catálogos del sistema y valores iniciales (Docs/14-base-de-datos).
 * El código del programa depende de estos `code`: cambiarlos es un cambio de código, no de datos.
 * Los textos visibles no viven aquí: la web y la app traducen por `code`.
 */

type Row = Record<string, string | number | boolean | string[] | null>;

export interface CatalogSeed {
  table: string;
  /** Columna única por la que se hace el upsert (casi siempre `code`). */
  key: string;
  rows: Row[];
  /** Catálogo del negocio: la semilla solo agrega lo que falta y nunca pisa lo que el administrador cambió. */
  insertOnly?: boolean;
}

const ordered = (rows: Row[]): Row[] => rows.map((row, index) => ({ sort_order: index + 1, ...row }));

const STATUS = (code: string, extra: Row = {}, initial = false, terminal = false): Row => ({
  code,
  is_initial: initial,
  is_terminal: terminal,
  ...extra,
});

export const CATALOGS: CatalogSeed[] = [
  // ─────────────── 00 · Transversal ───────────────
  { table: 'languages', key: 'code', rows: ordered([{ code: 'es' }, { code: 'en' }]) },
  {
    table: 'currencies',
    key: 'code',
    rows: ordered([
      { code: 'COP', minor_units: 0 },
      { code: 'USD', minor_units: 2 },
      { code: 'EUR', minor_units: 2 },
    ]),
  },
  {
    table: 'payment_methods',
    key: 'code',
    rows: ordered([
      { code: 'CASH', is_cash_on_delivery: true, is_account_based: false, requires_bank: false },
      { code: 'NEQUI', is_cash_on_delivery: true, is_account_based: true, requires_bank: false },
      { code: 'DAVIPLATA', is_cash_on_delivery: true, is_account_based: true, requires_bank: false },
      { code: 'BANK_TRANSFER', is_cash_on_delivery: true, is_account_based: true, requires_bank: true },
    ]),
  },
  {
    table: 'file_purposes',
    key: 'code',
    rows: ordered(
      [
        ['PRODUCT_IMAGE', 5, ['image/jpeg', 'image/png', 'image/webp'], false],
        ['ESTABLISHMENT_LOGO', 2, ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'], false],
        ['PURCHASE_RECEIPT', 8, ['image/jpeg', 'image/png', 'image/webp'], false],
        ['DELIVERY_PROOF', 8, ['image/jpeg', 'image/png', 'image/webp'], true],
        ['COURIER_DOCUMENT', 10, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], false],
        ['COLLECTION_QR', 2, ['image/jpeg', 'image/png', 'image/webp'], false],
        ['LEGAL_DOCUMENT', 10, ['application/pdf'], false],
      ].map(([code, megabytes, mimeTypes, camera]) => ({
        code: code as string,
        max_size_bytes: (megabytes as number) * 1024 * 1024,
        allowed_mime_types: mimeTypes as string[],
        requires_camera: camera as boolean,
      })),
    ),
  },
  {
    table: 'audit_actions',
    key: 'code',
    rows: ordered(
      [
        'USER_CREATED',
        'USER_DEACTIVATED',
        'ROLE_GRANTED',
        'ROLE_REVOKED',
        'COURIER_VERIFIED',
        'ORDER_OFFERED',
        'ORDER_REASSIGNED',
        'ORDER_CANCELLED',
        'INCIDENT_RESOLVED',
        'DELIVERY_PROOF_REVIEWED',
        'CASH_BOX_OPENED',
        'CASH_BOX_CLOSED',
        'CASH_ADJUSTED',
        'SETTING_CHANGED',
        'FEE_CHANGED',
        'COMMISSION_CHANGED',
        'PRODUCT_CHANGED',
        'ESTABLISHMENT_CHANGED',
        'CATEGORY_CHANGED',
      ].map((code) => ({ code })),
    ),
  },

  // ─────────────── E01 · Identidad y acceso ───────────────
  {
    table: 'document_types',
    key: 'code',
    rows: ordered(['CC', 'CE', 'PASSPORT', 'PPT', 'TI'].map((code) => ({ code }))),
  },
  {
    table: 'user_statuses',
    key: 'code',
    rows: ordered([
      STATUS('ACTIVE', { can_sign_in: true }, true),
      STATUS('SUSPENDED', { can_sign_in: false }),
      STATUS('DEACTIVATED', { can_sign_in: false }),
      STATUS('CLOSED', { can_sign_in: false }, false, true),
    ]),
  },
  {
    table: 'roles',
    key: 'code',
    rows: ordered([
      { code: 'CUSTOMER', requires_password: false, is_self_assignable: true, is_staff: false, requires_municipality: false },
      { code: 'COURIER', requires_password: true, is_self_assignable: false, is_staff: false, requires_municipality: true },
      { code: 'OPERATOR', requires_password: true, is_self_assignable: false, is_staff: true, requires_municipality: true },
      { code: 'ADMIN', requires_password: true, is_self_assignable: false, is_staff: true, requires_municipality: false },
    ]),
  },
  { table: 'platforms', key: 'code', rows: ordered(['ANDROID', 'IOS', 'WEB'].map((code) => ({ code }))) },
  {
    table: 'session_end_reasons',
    key: 'code',
    rows: ordered(
      ['SIGN_OUT', 'REFRESH_REUSE_DETECTED', 'ACCOUNT_DISABLED', 'ROLE_REVOKED', 'EXPIRED', 'PASSWORD_CHANGED'].map((code) => ({ code })),
    ),
  },
  { table: 'otp_purposes', key: 'code', rows: ordered(['SIGN_IN', 'STAFF_SIGN_IN', 'PHONE_CHANGE'].map((code) => ({ code }))) },
  { table: 'otp_channels', key: 'code', rows: ordered(['SMS', 'WHATSAPP'].map((code) => ({ code }))) },
  { table: 'auth_factors', key: 'code', rows: ordered(['OTP', 'PASSWORD'].map((code) => ({ code }))) },
  {
    table: 'legal_document_types',
    key: 'code',
    rows: ordered(
      ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY', 'COURIER_LOCATION_AUTHORIZATION'].map((code) => ({ code })),
    ),
  },
  { table: 'data_request_types', key: 'code', rows: ordered(['ACCESS', 'RECTIFICATION', 'DELETION', 'CONSENT_REVOCATION'].map((code) => ({ code }))) },
  {
    table: 'data_request_statuses',
    key: 'code',
    rows: ordered([STATUS('RECEIVED', {}, true), STATUS('IN_PROGRESS'), STATUS('COMPLETED', {}, false, true), STATUS('REJECTED', {}, false, true)]),
  },
  {
    table: 'courier_verification_statuses',
    key: 'code',
    rows: ordered([
      STATUS('PENDING', { can_receive_offers: false }, true),
      STATUS('VERIFIED', { can_receive_offers: true }),
      STATUS('SUSPENDED', { can_receive_offers: false }),
      STATUS('REJECTED', { can_receive_offers: false }),
    ]),
  },
  { table: 'funding_modes', key: 'code', rows: ordered(['CASH_BOX', 'OWN_FUNDS'].map((code) => ({ code }))) },
  {
    table: 'vehicle_types',
    key: 'code',
    rows: ordered([
      { code: 'MOTORCYCLE', requires_plate: true },
      { code: 'BICYCLE', requires_plate: false },
      { code: 'CAR', requires_plate: true },
      { code: 'ON_FOOT', requires_plate: false },
    ]),
  },
  {
    table: 'courier_document_types',
    key: 'code',
    rows: ordered([
      { code: 'ID_CARD', requires_expiry: false, is_vehicle_document: false },
      { code: 'DRIVER_LICENSE', requires_expiry: true, is_vehicle_document: false },
      { code: 'SOAT', requires_expiry: true, is_vehicle_document: true },
      { code: 'TECHNICAL_INSPECTION', requires_expiry: true, is_vehicle_document: true },
      { code: 'VEHICLE_REGISTRATION', requires_expiry: false, is_vehicle_document: true },
    ]),
  },
  {
    table: 'courier_document_statuses',
    key: 'code',
    rows: ordered([STATUS('PENDING_REVIEW', {}, true), STATUS('APPROVED'), STATUS('REJECTED')]),
  },
  { table: 'bank_account_types', key: 'code', rows: ordered(['SAVINGS', 'CHECKING'].map((code) => ({ code }))) },
  {
    // Catálogo del negocio: el administrador lo amplía. Esta es solo la lista inicial.
    table: 'banks',
    key: 'code',
    insertOnly: true,
    rows: ordered(
      [
        ['BANCOLOMBIA', 'Bancolombia'],
        ['DAVIVIENDA', 'Davivienda'],
        ['BANCO_DE_BOGOTA', 'Banco de Bogotá'],
        ['BANCO_AGRARIO', 'Banco Agrario'],
        ['BBVA', 'BBVA Colombia'],
        ['BANCO_DE_OCCIDENTE', 'Banco de Occidente'],
        ['BANCO_POPULAR', 'Banco Popular'],
        ['BANCO_CAJA_SOCIAL', 'Banco Caja Social'],
        ['AV_VILLAS', 'Banco AV Villas'],
        ['NU', 'Nu Colombia'],
      ].map(([code, name]) => ({ code, name })),
    ),
  },

  // ─────────────── E02 · Establecimientos y menús ───────────────
  {
    table: 'establishment_statuses',
    key: 'code',
    rows: ordered([
      STATUS('DRAFT', { is_visible_on_map: false, accepts_orders: false }, true),
      STATUS('ACTIVE', { is_visible_on_map: true, accepts_orders: true }),
      STATUS('TEMPORARILY_CLOSED', { is_visible_on_map: true, accepts_orders: false }),
      STATUS('INACTIVE', { is_visible_on_map: false, accepts_orders: false }),
    ]),
  },
  {
    // Catálogo del negocio (H02.4): el administrador cambia nombres, íconos y orden desde el panel.
    table: 'establishment_categories',
    key: 'code',
    insertOnly: true,
    rows: ordered([
      { code: 'FAST_FOOD', icon: 'utensils-crossed' },
      { code: 'RESTAURANT', icon: 'store' },
      { code: 'SUPERMARKET', icon: 'shopping-basket' },
      { code: 'STORE', icon: 'package' },
      { code: 'PHARMACY', icon: 'pill' },
    ]),
  },
  {
    table: 'product_statuses',
    key: 'code',
    rows: ordered([
      STATUS('AVAILABLE', { is_visible: true, is_orderable: true }, true),
      STATUS('SOLD_OUT', { is_visible: true, is_orderable: false }),
      STATUS('DISCONTINUED', { is_visible: false, is_orderable: false }, false, true),
    ]),
  },

  // ─────────────── E03 · Zonas, horario y configuración ───────────────
  { table: 'zone_kinds', key: 'code', rows: ordered(['URBAN', 'RURAL'].map((code) => ({ code }))) },
  {
    table: 'setting_data_types',
    key: 'code',
    rows: ordered(['INTEGER', 'MONEY_COP', 'SECONDS', 'METERS', 'DAYS'].map((code) => ({ code }))),
  },
];

/** Máquinas de estado en datos: pares permitidos `desde → hacia`. */
export const TRANSITIONS: { table: string; catalog: string; pairs: [string, string][] }[] = [
  {
    table: 'user_status_transitions',
    catalog: 'user_statuses',
    pairs: [
      ['ACTIVE', 'SUSPENDED'],
      ['SUSPENDED', 'ACTIVE'],
      ['ACTIVE', 'DEACTIVATED'],
      ['SUSPENDED', 'DEACTIVATED'],
      ['DEACTIVATED', 'ACTIVE'],
      ['ACTIVE', 'CLOSED'],
      ['SUSPENDED', 'CLOSED'],
      ['DEACTIVATED', 'CLOSED'],
    ],
  },
  {
    table: 'courier_verification_transitions',
    catalog: 'courier_verification_statuses',
    pairs: [
      ['PENDING', 'VERIFIED'],
      ['PENDING', 'REJECTED'],
      ['VERIFIED', 'SUSPENDED'],
      ['SUSPENDED', 'VERIFIED'],
      ['REJECTED', 'PENDING'],
    ],
  },
  {
    // DRAFT → ACTIVE exige además al menos un producto disponible (lo valida el caso de uso).
    table: 'establishment_status_transitions',
    catalog: 'establishment_statuses',
    pairs: [
      ['DRAFT', 'ACTIVE'],
      ['DRAFT', 'INACTIVE'],
      ['ACTIVE', 'TEMPORARILY_CLOSED'],
      ['TEMPORARILY_CLOSED', 'ACTIVE'],
      ['ACTIVE', 'INACTIVE'],
      ['TEMPORARILY_CLOSED', 'INACTIVE'],
      ['INACTIVE', 'ACTIVE'],
    ],
  },
  {
    table: 'product_status_transitions',
    catalog: 'product_statuses',
    pairs: [
      ['AVAILABLE', 'SOLD_OUT'],
      ['SOLD_OUT', 'AVAILABLE'],
      ['AVAILABLE', 'DISCONTINUED'],
      ['SOLD_OUT', 'DISCONTINUED'],
    ],
  },
];

const CUSTOMER_PERMISSIONS = ['orders.create', 'orders.read_own', 'orders.confirm_delivery', 'adjustments.decide', 'incidents.report'];
const COURIER_PERMISSIONS = ['offers.respond', 'orders.progress', 'location.report', 'adjustments.report', 'cash.read_own'];
const STAFF_PERMISSIONS = [
  'orders.read_all',
  'orders.assign',
  'orders.cancel',
  'deliveries.review',
  'incidents.resolve',
  'couriers.read_location',
  'establishments.manage',
  'products.manage',
];
const ADMIN_PERMISSIONS = [
  'users.manage_staff',
  'couriers.manage',
  'couriers.verify',
  'zones.manage',
  'hours.manage',
  'settings.manage',
  'commission.manage',
  'cash.manage',
  'cash.adjust',
  'audit.read',
  'legal.manage',
  'categories.manage',
];

/** Permisos por rol (Docs/14-base-de-datos/E01-identidad-y-acceso.md). */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  CUSTOMER: ['account.manage_own', ...CUSTOMER_PERMISSIONS],
  COURIER: ['account.manage_own', ...COURIER_PERMISSIONS],
  OPERATOR: ['account.manage_own', ...STAFF_PERMISSIONS],
  ADMIN: ['account.manage_own', ...STAFF_PERMISSIONS, ...ADMIN_PERMISSIONS],
};

/** Documentos legales que debe aceptar quien tiene cada rol. */
export const LEGAL_REQUIREMENTS: Record<string, string[]> = {
  CUSTOMER: ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY'],
  COURIER: ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY', 'COURIER_LOCATION_AUTHORIZATION'],
  OPERATOR: ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY'],
  ADMIN: ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY'],
};

/** Primera versión publicada de cada documento legal (el texto vive en la web: /legal/<documento>). */
export const INITIAL_LEGAL_VERSION = '2026-10';

export const CATEGORY_NAMES: Record<string, { es: string; en: string }> = {
  FAST_FOOD: { es: 'Comida rápida', en: 'Fast food' },
  RESTAURANT: { es: 'Restaurantes', en: 'Restaurants' },
  SUPERMARKET: { es: 'Supermercados', en: 'Supermarkets' },
  STORE: { es: 'Tiendas', en: 'Stores' },
  PHARMACY: { es: 'Farmacias', en: 'Pharmacies' },
};

/** Parámetros del negocio con su valor global inicial (E03). */
export const SETTINGS: {
  key: string;
  type: string;
  value: number;
  min?: number;
  max?: number;
  scoped: boolean;
}[] = [
  { key: 'orders.new_customer_max_cop', type: 'MONEY_COP', value: 100_000, min: 0, scoped: true },
  { key: 'offers.timeout_seconds', type: 'SECONDS', value: 60, min: 15, max: 600, scoped: true },
  { key: 'adjustments.timeout_seconds', type: 'SECONDS', value: 180, min: 30, max: 1800, scoped: true },
  { key: 'delivery.arriving_meters', type: 'METERS', value: 80, min: 10, max: 1000, scoped: true },
  { key: 'delivery.proof_after_seconds', type: 'SECONDS', value: 600, min: 60, max: 3600, scoped: true },
  { key: 'geofence.consecutive_readings', type: 'INTEGER', value: 2, min: 1, max: 10, scoped: false },
  { key: 'preparation.recheck_seconds', type: 'SECONDS', value: 300, min: 60, max: 3600, scoped: false },
  { key: 'location.retention_days', type: 'DAYS', value: 30, min: 1, max: 365, scoped: false },
  { key: 'otp.ttl_seconds', type: 'SECONDS', value: 300, min: 60, max: 900, scoped: false },
  { key: 'otp.max_attempts', type: 'INTEGER', value: 5, min: 1, max: 10, scoped: false },
  { key: 'otp.max_sends_per_hour', type: 'INTEGER', value: 3, min: 1, max: 10, scoped: false },
  { key: 'security.auth_log_retention_days', type: 'DAYS', value: 90, min: 7, max: 730, scoped: false },
];

/** Geografía inicial: Colombia → Putumayo → Villagarzón (municipio del piloto). */
export const GEOGRAPHY = {
  country: { iso2: 'CO', name: 'Colombia' },
  department: { daneCode: '86', name: 'Putumayo' },
  municipality: {
    daneCode: '86885',
    name: 'Villagarzón',
    timeZone: 'America/Bogota',
    center: { lat: 1.0294, lng: -76.6165 },
    launchedAt: '2026-10-16T00:00:00-05:00',
  },
};
