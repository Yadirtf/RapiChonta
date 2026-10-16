import 'package:equatable/equatable.dart';

import 'account.dart';

/// Código enviado por SMS.
class SentCode extends Equatable {
  const SentCode({required this.challengeId, required this.expiresAt, required this.maskedPhone, this.devCode});

  final String challengeId;
  final DateTime expiresAt;
  final String maskedPhone;

  /// Solo en entornos de prueba sin proveedor de SMS (OTP_EXPOSE_CODE=true).
  final String? devCode;

  @override
  List<Object?> get props => [challengeId];
}

/// Resultado de validar el código del cliente.
sealed class CodeVerification {
  const CodeVerification();
}

class SignedIn extends CodeVerification {
  const SignedIn(this.account);
  final Account account;
}

/// Número nuevo: falta el nombre y aceptar los documentos.
class RegistrationRequired extends CodeVerification {
  const RegistrationRequired({required this.registrationToken, required this.requiredConsents});
  final String registrationToken;
  final List<LegalDocument> requiredConsents;
}
