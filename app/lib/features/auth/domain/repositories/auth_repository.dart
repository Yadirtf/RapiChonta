import '../entities/account.dart';
import '../entities/sign_in.dart';

/// Puerto de autenticación: la presentación no sabe de Dio, tokens ni almacenamiento seguro.
abstract interface class AuthRepository {
  /// Recupera la sesión guardada (token de refresco en Keystore/Keychain). null = no hay sesión.
  Future<Account?> restore();

  Future<SentCode> requestCode(String phone, String language);
  Future<CodeVerification> verifyCode(String challengeId, String code);
  Future<Account> register({
    required String registrationToken,
    required String givenNames,
    String? familyNames,
    required List<String> acceptedLegalVersionIds,
    required String language,
  });

  /// Domiciliarios y personal: contraseña y, si es correcta, código al celular.
  Future<SentCode> startPasswordSignIn(String phone, String password, String language);
  Future<Account> completePasswordSignIn(String challengeId, String code);

  /// RF-06: modo cliente ↔ modo domiciliario. Volver a un rol con contraseña la pide.
  Future<Account> switchRole(Role role, {String? password});
  Future<void> signOut();

  /// Se emite cuando la sesión termina sin que el usuario la cierre (refresco revocado o vencido).
  Stream<void> get sessionEnded;
}
