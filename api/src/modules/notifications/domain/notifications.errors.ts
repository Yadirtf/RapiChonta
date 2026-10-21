import { DomainError, NotFoundError } from '../../../shared/domain/domain.error';

/** Errores del módulo de notificaciones. El `code` es el contrato con la web y la app (lo traducen). */
export const NotificationErrors = {
  /** La sesión no viene de una instalación de la app (por ejemplo, la web): no hay dónde registrar el token. */
  deviceRequired: () => new DomainError('Esta sesión no tiene un dispositivo para recibir avisos', 'PUSH_DEVICE_REQUIRED'),
  notificationNotFound: () => new NotFoundError('NOTIFICATION_NOT_FOUND', 'Aviso no encontrado'),
};
