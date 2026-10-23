/**
 * Catálogos del sistema y valores iniciales (Docs/14-base-de-datos).
 * El código del programa depende de estos `code`: cambiarlos es un cambio de código, no de datos.
 * Los textos visibles no viven aquí: la web y la app traducen por `code`.
 */

type Row = Record<string, string | number | boolean | string[] | Date | null>;

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
        ['PAYMENT_METHOD_IMAGE', 1, ['image/jpeg', 'image/png', 'image/webp'], false],
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
        'ZONE_CHANGED',
        'HOURS_CHANGED',
        'COMMISSION_CHANGED',
        'PRODUCT_CHANGED',
        'ESTABLISHMENT_CHANGED',
        'CATEGORY_CHANGED',
        'MUNICIPALITY_CHANGED',
        'PAYMENT_METHOD_CHANGED',
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
  { table: 'zone_kinds', key: 'code', rows: ordered(['COVERAGE', 'URBAN', 'RURAL'].map((code) => ({ code }))) },
  { table: 'zone_shapes', key: 'code', rows: ordered(['POLYGON', 'CIRCLE'].map((code) => ({ code }))) },
  {
    table: 'setting_data_types',
    key: 'code',
    rows: ordered(['INTEGER', 'MONEY_COP', 'SECONDS', 'METERS', 'DAYS'].map((code) => ({ code }))),
  },

  // ─────────────── E04 · Pedido del cliente ───────────────
  {
    table: 'fulfillment_modes',
    key: 'code',
    rows: ordered([
      { code: 'COURIER_PURCHASE', deactivated_at: null },
      // Comercios aliados (E15): existe para que el diseño no cambie, pero no se usa hasta entonces.
      { code: 'MERCHANT_DIRECT', deactivated_at: new Date('2026-10-21T00:00:00Z') },
    ]),
  },
  {
    // sort_order es el orden del recorrido: la línea de tiempo del cliente lo sigue.
    table: 'order_statuses',
    key: 'code',
    rows: ordered(
      (
        [
          // code, visible al cliente, paso del recorrido, revela datos de entrega, cuenta como entregado, avisa por push (H06.2),
          // tiene domiciliario (E07: exactamente una asignación vigente)
          ['PENDING_ASSIGNMENT', true, true, false, false, false, false],
          ['OFFERED', false, false, false, false, false, false],
          ['ACCEPTED', true, true, false, false, true, true],
          ['AT_ESTABLISHMENT', true, true, false, false, true, true],
          ['AWAITING_CUSTOMER', true, false, false, false, false, true],
          ['PREPARING', true, true, false, false, false, true],
          ['ON_THE_WAY', true, true, true, false, true, true],
          ['ARRIVING', true, true, true, false, true, true],
          // Entregado con foto: el domiciliario queda libre y el cliente recibe aviso para confirmar o reclamar.
          ['PENDING_REVIEW', true, false, true, false, true, false],
          ['DISPUTED', true, false, true, false, false, false],
          ['DELIVERED', true, true, false, true, true, false],
          ['CANCELLED', true, false, false, false, true, false],
        ] as const
      ).map(([code, visible, milestone, reveals, delivered, notifies, courier]) =>
        STATUS(
          code,
          {
            is_visible_to_customer: visible,
            is_milestone: milestone,
            reveals_delivery_details: reveals,
            counts_as_delivered: delivered,
            notifies_customer: notifies,
            requires_courier: courier,
          },
          code === 'PENDING_ASSIGNMENT',
          code === 'DELIVERED' || code === 'CANCELLED',
        ),
      ),
    ),
  },
  {
    table: 'status_change_sources',
    key: 'code',
    rows: ordered([
      { code: 'USER_ACTION', is_automatic: false },
      { code: 'OFFLINE_SYNC', is_automatic: false },
      { code: 'GEOFENCE', is_automatic: true },
      { code: 'TIMER', is_automatic: true },
      // E07: todos los destinatarios dijeron "No puedo" antes del vencimiento; el pedido vuelve al panel.
      { code: 'OFFERS_DECLINED', is_automatic: true },
    ]),
  },
  // ─────────────── E07 · Asignación por el operador ───────────────
  {
    table: 'offer_modes',
    key: 'code',
    rows: ordered([
      { code: 'SPECIFIC', max_recipients: 1 },
      { code: 'BROADCAST', max_recipients: null },
    ]),
  },
  {
    table: 'offer_recipient_statuses',
    key: 'code',
    rows: ordered([
      STATUS('PENDING', {}, true),
      STATUS('ACCEPTED', {}, false, true),
      STATUS('REJECTED', {}, false, true),
      STATUS('EXPIRED', {}, false, true),
      STATUS('WITHDRAWN', {}, false, true),
    ]),
  },
  {
    table: 'assignment_release_reasons',
    key: 'code',
    rows: ordered(['COURIER_RELEASED', 'OPERATOR_REASSIGNED', 'ORDER_CANCELLED', 'ORDER_COMPLETED'].map((code) => ({ code }))),
  },
  // Disponibilidad del domiciliario (E08, la usa el despacho).
  {
    table: 'availability_end_reasons',
    key: 'code',
    rows: ordered(['TOGGLED_OFF', 'INACTIVITY_TIMEOUT', 'ACCOUNT_DISABLED'].map((code) => ({ code }))),
  },
  // ─────────────── E06 · Notificaciones push ───────────────
  { table: 'push_providers', key: 'code', rows: ordered([{ code: 'FCM' }, { code: 'HMS' }]) },
  {
    table: 'push_token_invalidation_reasons',
    key: 'code',
    rows: ordered(['REPLACED', 'SIGNED_OUT', 'REJECTED_BY_PROVIDER'].map((code) => ({ code }))),
  },
  {
    // Alta prioridad: el proveedor lo entrega de inmediato aunque el teléfono ahorre batería (Doze).
    table: 'notification_types',
    key: 'code',
    rows: ordered(
      (
        [
          ['ORDER_OFFERED', true],
          ['OFFER_WITHDRAWN', false],
          ['ORDER_STATUS_CHANGED', true],
          ['PREPARATION_TIME_REACHED', true],
          ['ADJUSTMENT_REQUESTED', true],
          ['ADJUSTMENT_RESOLVED', true],
          ['INCIDENT_OPENED', true],
          ['INCIDENT_RESOLVED', false],
          ['DELIVERY_PROOF_PENDING', true],
          // E09: al domiciliario, el pedido que llevaba se canceló (desde la consulta al cliente).
          ['TRIP_CANCELLED', true],
        ] as const
      ).map(([code, high]) => ({ code, is_high_priority: high })),
    ),
  },
  // ─────────────── E09 · Producto faltante ───────────────
  {
    table: 'adjustment_reasons',
    key: 'code',
    rows: ordered([
      { code: 'UNAVAILABLE', requires_price: false },
      { code: 'PRICE_CHANGED', requires_price: true },
    ]),
  },
  {
    // Lo que hace cada decisión es dato: el caso de uso y la vista v_order_lines leen estas columnas, no el código.
    table: 'adjustment_decisions',
    key: 'code',
    rows: ordered(
      (
        [
          // code, quita la línea, usa el precio nuevo, crea sustituta, cancela el pedido, automática
          ['SUBSTITUTE', true, false, true, false, false],
          ['REMOVE_ITEM', true, false, false, false, false],
          ['ACCEPT_PRICE', false, true, false, false, false],
          ['CANCEL_ORDER', false, false, false, true, false],
          ['EXPIRED_REMOVED', true, false, false, false, true],
        ] as const
      ).map(([code, removes, price, substitute, cancels, automatic]) => ({
        code,
        removes_item: removes,
        uses_reported_price: price,
        creates_substitute: substitute,
        cancels_order: cancels,
        is_automatic: automatic,
      })),
    ),
  },
  // E10: por qué se canceló un pedido (E09 usa CUSTOMER_REQUEST y ALL_ITEMS_UNAVAILABLE). Automática = la pone el
  // sistema o la resolución de una novedad; el operador elige entre las demás al cancelar (H10.5).
  {
    table: 'cancellation_reasons',
    key: 'code',
    rows: ordered(
      (
        [
          ['CUSTOMER_REQUEST', false],
          ['NO_COURIER_AVAILABLE', false],
          ['ESTABLISHMENT_CLOSED', false],
          ['ALL_ITEMS_UNAVAILABLE', true],
          ['CUSTOMER_UNREACHABLE', false],
          ['INCIDENT_RESOLUTION', true],
        ] as const
      ).map(([code, automatic]) => ({ code, is_automatic: automatic })),
    ),
  },
  // ─────────────── E10 · Incidencias ───────────────
  {
    // opens_dispute: reportarla pasa el pedido a DISPUTED (el de "No lo recibí" y el caso que abre el operador al
    // revisar una foto). Los reclamos sobre un pedido ya entregado no lo cambian.
    table: 'incident_types',
    key: 'code',
    rows: ordered(
      (
        [
          ['NOT_RECEIVED', true],
          ['WRONG_ORDER', false],
          ['DAMAGED', false],
          ['OTHER', true],
        ] as const
      ).map(([code, opens]) => ({ code, opens_dispute: opens })),
    ),
  },
  {
    table: 'incident_statuses',
    key: 'code',
    rows: ordered([STATUS('OPEN', {}, true), STATUS('IN_REVIEW'), STATUS('RESOLVED', {}, false, true)]),
  },
  {
    table: 'notification_delivery_statuses',
    key: 'code',
    rows: ordered([STATUS('QUEUED', {}, true), STATUS('SENT', {}, false, true), STATUS('FAILED', {}, false, true)]),
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
    table: 'incident_status_transitions',
    catalog: 'incident_statuses',
    pairs: [
      ['OPEN', 'IN_REVIEW'],
      ['OPEN', 'RESOLVED'],
      ['IN_REVIEW', 'RESOLVED'],
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

/**
 * Máquina de estados del pedido (Docs/14-base-de-datos/E04): quién puede hacer cada cambio. `system`: lo hace
 * la API sin una persona (geocerca, temporizador). Solo se agregan pares y roles; quitar uno es una migración.
 */
export const ORDER_TRANSITIONS: { from: string; to: string; roles: string[]; system?: boolean }[] = [
  { from: 'PENDING_ASSIGNMENT', to: 'OFFERED', roles: ['OPERATOR', 'ADMIN'] },
  { from: 'PENDING_ASSIGNMENT', to: 'CANCELLED', roles: ['CUSTOMER', 'OPERATOR', 'ADMIN'] },
  { from: 'OFFERED', to: 'ACCEPTED', roles: ['COURIER'] },
  { from: 'OFFERED', to: 'PENDING_ASSIGNMENT', roles: [], system: true },
  { from: 'OFFERED', to: 'CANCELLED', roles: ['CUSTOMER', 'OPERATOR', 'ADMIN'] },
  { from: 'ACCEPTED', to: 'AT_ESTABLISHMENT', roles: [], system: true },
  { from: 'ACCEPTED', to: 'PENDING_ASSIGNMENT', roles: ['COURIER', 'OPERATOR', 'ADMIN'] },
  { from: 'ACCEPTED', to: 'CANCELLED', roles: ['OPERATOR', 'ADMIN'] },
  { from: 'AT_ESTABLISHMENT', to: 'AWAITING_CUSTOMER', roles: ['COURIER'] },
  { from: 'AT_ESTABLISHMENT', to: 'PREPARING', roles: ['COURIER'] },
  { from: 'AT_ESTABLISHMENT', to: 'PENDING_ASSIGNMENT', roles: ['OPERATOR', 'ADMIN'] },
  { from: 'AT_ESTABLISHMENT', to: 'CANCELLED', roles: ['OPERATOR', 'ADMIN'] },
  { from: 'AWAITING_CUSTOMER', to: 'AT_ESTABLISHMENT', roles: ['CUSTOMER'], system: true },
  { from: 'AWAITING_CUSTOMER', to: 'CANCELLED', roles: ['CUSTOMER'], system: true },
  { from: 'PREPARING', to: 'ON_THE_WAY', roles: ['COURIER'] },
  // La geocerca, o el domiciliario con "Llegué" si el GPS no la dispara.
  { from: 'ON_THE_WAY', to: 'ARRIVING', roles: ['COURIER'], system: true },
  // El cliente con "Recibí mi pedido", o el domiciliario con el código de entrega que le dice el cliente.
  { from: 'ON_THE_WAY', to: 'DELIVERED', roles: ['CUSTOMER', 'COURIER'] },
  { from: 'ON_THE_WAY', to: 'DISPUTED', roles: ['CUSTOMER'] },
  { from: 'ARRIVING', to: 'DELIVERED', roles: ['CUSTOMER', 'COURIER'] },
  { from: 'ARRIVING', to: 'DISPUTED', roles: ['CUSTOMER'] },
  { from: 'ARRIVING', to: 'PENDING_REVIEW', roles: ['COURIER'] },
  // Entregado con foto: el cliente confirma o reclama; si nadie reclama, se cierra solo (delivery.review_auto_close_seconds).
  { from: 'PENDING_REVIEW', to: 'DELIVERED', roles: ['CUSTOMER', 'OPERATOR', 'ADMIN'], system: true },
  { from: 'PENDING_REVIEW', to: 'DISPUTED', roles: ['CUSTOMER', 'OPERATOR', 'ADMIN'] },
  { from: 'DISPUTED', to: 'DELIVERED', roles: ['OPERATOR', 'ADMIN'] },
  { from: 'DISPUTED', to: 'CANCELLED', roles: ['OPERATOR', 'ADMIN'] },
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
  'municipalities.manage',
];

/**
 * Tipos de movimiento de la caja del domiciliario (Docs/14-base-de-datos/E11). direction: +1 aumenta lo que el
 * domiciliario debe entregar a RapiChonta. E08 usa PURCHASE (lo pagado en el local); los demás llegan con E10 y E11.
 */
export const CASH_MOVEMENT_TYPES: {
  code: string;
  direction: 1 | -1;
  requiresOrder: boolean;
  requiresPaymentMethod: boolean;
  isManual: boolean;
  usesCollectionAccount: boolean;
  onlyForFundingMode: string | null;
}[] = [
  { code: 'OPENING', direction: 1, requiresOrder: false, requiresPaymentMethod: true, isManual: true, usesCollectionAccount: true, onlyForFundingMode: 'CASH_BOX' },
  { code: 'PURCHASE', direction: -1, requiresOrder: true, requiresPaymentMethod: false, isManual: false, usesCollectionAccount: false, onlyForFundingMode: null },
  { code: 'COLLECTION', direction: 1, requiresOrder: true, requiresPaymentMethod: true, isManual: false, usesCollectionAccount: true, onlyForFundingMode: null },
  { code: 'RETURN', direction: -1, requiresOrder: false, requiresPaymentMethod: true, isManual: true, usesCollectionAccount: false, onlyForFundingMode: null },
  { code: 'ADJUSTMENT_IN', direction: 1, requiresOrder: false, requiresPaymentMethod: false, isManual: true, usesCollectionAccount: false, onlyForFundingMode: null },
  { code: 'ADJUSTMENT_OUT', direction: -1, requiresOrder: false, requiresPaymentMethod: false, isManual: true, usesCollectionAccount: false, onlyForFundingMode: null },
];

/**
 * Cómo se resuelve una novedad (Docs/14-base-de-datos/E10) y a qué estado deja al pedido: el caso de uso lee la
 * columna, no el código. Nulo: el pedido no cambia (reclamo sobre un pedido ya entregado).
 */
export const INCIDENT_RESOLUTIONS: { code: string; resultingOrderStatus: string | null }[] = [
  { code: 'RESOLVED_AS_DELIVERED', resultingOrderStatus: 'DELIVERED' },
  { code: 'RESOLVED_AS_CANCELLED', resultingOrderStatus: 'CANCELLED' },
  { code: 'NO_ORDER_CHANGE', resultingOrderStatus: null },
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
  { key: 'delivery.proof_after_seconds', type: 'SECONDS', value: 300, min: 60, max: 3600, scoped: true },
  { key: 'delivery.review_auto_close_seconds', type: 'SECONDS', value: 7200, min: 600, max: 86400, scoped: true },
  { key: 'geofence.consecutive_readings', type: 'INTEGER', value: 2, min: 1, max: 10, scoped: false },
  { key: 'preparation.recheck_seconds', type: 'SECONDS', value: 300, min: 60, max: 3600, scoped: false },
  { key: 'location.retention_days', type: 'DAYS', value: 30, min: 1, max: 365, scoped: false },
  { key: 'otp.ttl_seconds', type: 'SECONDS', value: 300, min: 60, max: 900, scoped: false },
  { key: 'otp.max_attempts', type: 'INTEGER', value: 5, min: 1, max: 10, scoped: false },
  { key: 'otp.max_sends_per_hour', type: 'INTEGER', value: 3, min: 1, max: 10, scoped: false },
  { key: 'security.auth_log_retention_days', type: 'DAYS', value: 90, min: 7, max: 730, scoped: false },
];

/**
 * Geografía: Colombia → Putumayo y sus 13 municipios (códigos DANE). Solo Villagarzón (el piloto) arranca
 * abierto; los demás quedan "en preparación" hasta que el administrador les define cobertura, horario y
 * comisión y los abre desde el panel (H03.5). El centro es la cabecera municipal: se ajusta en el panel.
 */
export const GEOGRAPHY = {
  country: { iso2: 'CO', name: 'Colombia' },
  department: { daneCode: '86', name: 'Putumayo' },
  municipalities: [
    { daneCode: '86885', name: 'Villagarzón', center: { lat: 1.0294, lng: -76.6165 }, launchedAt: '2026-10-16T00:00:00-05:00' },
    { daneCode: '86001', name: 'Mocoa', center: { lat: 1.1514, lng: -76.6464 } },
    { daneCode: '86219', name: 'Colón', center: { lat: 1.1897, lng: -76.9731 } },
    { daneCode: '86320', name: 'Orito', center: { lat: 0.6664, lng: -76.8711 } },
    { daneCode: '86568', name: 'Puerto Asís', center: { lat: 0.505, lng: -76.4958 } },
    { daneCode: '86569', name: 'Puerto Caicedo', center: { lat: 0.6853, lng: -76.6044 } },
    { daneCode: '86571', name: 'Puerto Guzmán', center: { lat: 0.9628, lng: -76.4086 } },
    { daneCode: '86573', name: 'Puerto Leguízamo', center: { lat: -0.1931, lng: -74.7811 } },
    { daneCode: '86749', name: 'Sibundoy', center: { lat: 1.2033, lng: -76.9192 } },
    { daneCode: '86755', name: 'San Francisco', center: { lat: 1.1764, lng: -76.8783 } },
    { daneCode: '86757', name: 'San Miguel', center: { lat: 0.3422, lng: -76.9111 } },
    { daneCode: '86760', name: 'Santiago', center: { lat: 1.1475, lng: -77.0006 } },
    { daneCode: '86865', name: 'Valle del Guamuez', center: { lat: 0.4256, lng: -76.9075 } },
  ] as { daneCode: string; name: string; center: { lat: number; lng: number }; launchedAt?: string }[],
  timeZone: 'America/Bogota',
};
