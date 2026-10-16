import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';

/// Traduce el `code` de la API al idioma de la app (mismo contrato que web/messages → errors).
String errorText(AppLocalizations l10n, Object error) {
  final failure = error is Failure ? error : const Failure('', code: 'UNKNOWN');
  final minutes = ((failure.retryAfterSeconds ?? 60) / 60).ceil().clamp(1, 1440);
  return switch (failure.code) {
    'NETWORK_ERROR' => l10n.errNetwork,
    'SERVER_ERROR' || 'INTERNAL_ERROR' => l10n.errServer,
    'VALIDATION_FAILED' => l10n.errValidation,
    'TOO_MANY_REQUESTS' => l10n.errTooManyRequests,
    'SESSION_INVALID' || 'UNAUTHENTICATED' => l10n.errSessionInvalid,
    'REFRESH_REUSED' => l10n.errRefreshReused,
    'PERMISSION_DENIED' || 'ROLE_NOT_ALLOWED' => l10n.errPermissionDenied,
    'INVALID_PHONE' => l10n.errInvalidPhone,
    'OTP_SEND_LIMIT' => l10n.errOtpSendLimit(minutes),
    'OTP_INVALID' => l10n.errOtpInvalid(failure.remainingAttempts ?? 0),
    'OTP_EXPIRED' => l10n.errOtpExpired,
    'OTP_LOCKED' => l10n.errOtpLocked,
    'OTP_NOT_FOUND' => l10n.errOtpNotFound,
    'OTP_PROVIDER_UNAVAILABLE' => l10n.errOtpProviderUnavailable,
    'INVALID_CREDENTIALS' => l10n.errInvalidCredentials,
    'PASSWORD_LOCKED' => l10n.errPasswordLocked(minutes),
    'WEAK_PASSWORD' => l10n.errWeakPassword,
    'ACCOUNT_DISABLED' => l10n.errAccountDisabled,
    'REGISTRATION_EXPIRED' => l10n.errRegistrationExpired,
    'CONSENT_REQUIRED' => l10n.errConsentRequired,
    'PHONE_ALREADY_REGISTERED' => l10n.errPhoneAlreadyRegistered,
    'ROLE_NOT_GRANTED' => l10n.errRoleNotGranted,
    'PASSWORD_REQUIRED' => l10n.errPasswordRequired,
    'SAME_PHONE' => l10n.errSamePhone,
    'PASSWORD_NOT_SET' => l10n.errPasswordNotSet,
    _ => l10n.errUnknown,
  };
}

/// Códigos tras los que el código enviado ya no sirve: hay que pedir otro.
bool isDeadCode(Object error) =>
    error is Failure && const {'OTP_EXPIRED', 'OTP_LOCKED', 'OTP_NOT_FOUND'}.contains(error.code);
