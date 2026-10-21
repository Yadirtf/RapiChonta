import { ConflictError, DomainError, NotFoundError, PermissionDeniedError, ServiceUnavailableError } from '../../../shared/domain/domain.error';

/** Errores del módulo business-config. El `code` es el contrato con la web y la app (lo traducen). */
export const BusinessErrors = {
  municipalityRequired: () => new DomainError('Elija el municipio', 'MUNICIPALITY_REQUIRED'),
  municipalityNotFound: () => new NotFoundError('MUNICIPALITY_NOT_FOUND', 'Municipio no encontrado'),

  zoneNotFound: () => new NotFoundError('ZONE_NOT_FOUND', 'Zona no encontrada'),
  zoneNameRequired: () => new DomainError('El nombre de la zona es obligatorio', 'TEXT_REQUIRED', { field: 'name' }),
  zoneNameTaken: () => new ConflictError('ZONE_NAME_TAKEN', 'Ya hay una zona activa con ese nombre'),
  /** `zones`: las zonas activas con las que choca y cuántos m² comparten (el panel las resalta). */
  zoneOverlap: (zones: { id: string; name: string; overlapSquareMeters: number }[]) =>
    new DomainError('La zona se superpone con otra zona activa', 'ZONE_OVERLAP', { zones }),
  zoneTrimEmpty: () => new DomainError('Al recortar no queda área', 'ZONE_TRIM_EMPTY'),
  zoneTrimSplit: () => new DomainError('Al recortar la zona queda partida en varias piezas', 'ZONE_TRIM_SPLIT'),
  /** `distanceMeters`: qué tan lejos queda el punto del borde de la cobertura (el cliente lo ve). */
  noCoverage: (distanceMeters: number | null = null) =>
    new DomainError('La dirección está fuera de las zonas de entrega', 'NO_COVERAGE', { distanceMeters }),
  invalidRadius: (min: number, max: number) => new DomainError(`El radio debe estar entre ${min} y ${max} m`, 'INVALID_RADIUS', { min, max }),
  coverageNotFound: () => new NotFoundError('COVERAGE_NOT_FOUND', 'El municipio no tiene cobertura'),
  /** `missing`: lo que falta para abrir (COVERAGE, HOURS, COMMISSION); el panel lo muestra como lista. */
  municipalityNotReady: (missing: string[]) => new DomainError('Al municipio le falta configuración para abrir', 'MUNICIPALITY_NOT_READY', { missing }),
  globalAdminOnly: () => new PermissionDeniedError('GLOBAL_ADMIN_ONLY', 'Solo el administrador general abre o pausa municipios'),
  establishmentNotFound: () => new NotFoundError('ESTABLISHMENT_NOT_FOUND', 'Establecimiento no encontrado'),

  invalidTime: () => new DomainError('Hora inválida (HH:MM)', 'INVALID_TIME'),
  invalidSlot: (weekday: number | null) => new DomainError('La franja debe cerrar después de abrir', 'INVALID_TIME_SLOT', { weekday }),
  overlappingSlots: (weekday: number | null) => new DomainError('Las franjas del día se cruzan', 'OVERLAPPING_TIME_SLOTS', { weekday }),
  tooManySlots: (max: number) => new DomainError(`Máximo ${max} franjas por día`, 'TOO_MANY_TIME_SLOTS', { max }),
  invalidDate: () => new DomainError('Fecha inválida', 'INVALID_DATE'),
  exceptionInPast: () => new DomainError('La fecha ya pasó', 'DATE_IN_PAST'),
  exceptionNotFound: () => new NotFoundError('EXCEPTION_NOT_FOUND', 'No hay horario especial para esa fecha'),
  /** Para E04: la API rechaza pedidos fuera de horario aunque el cliente lo intente directamente (H03.2). */
  outsideOperatingHours: (nextOpeningAt: Date | null) =>
    new DomainError('Fuera del horario de pedidos', 'OUTSIDE_OPERATING_HOURS', { nextOpeningAt: nextOpeningAt?.toISOString() ?? null }),

  settingNotFound: () => new NotFoundError('SETTING_NOT_FOUND', 'Parámetro no encontrado'),
  settingNotScoped: () => new DomainError('Este parámetro no admite un valor por municipio', 'SETTING_NOT_SCOPED'),
  invalidSettingValue: (min: string | null, max: string | null) =>
    new DomainError('Valor fuera de rango', 'INVALID_SETTING_VALUE', { min, max }),
  invalidCommission: () => new DomainError('La comisión debe estar entre 0 % y 99,99 %', 'INVALID_COMMISSION'),

  exchangeRatesUnavailable: () => new ServiceUnavailableError('EXCHANGE_RATES_UNAVAILABLE', 'No se pudo consultar la tasa de cambio'),
};
