import '../../../../core/network/api_failure.dart';
import '../../domain/entities/account.dart';
import '../../domain/entities/sign_in.dart';
import '../../domain/repositories/account_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/identity_remote_datasource.dart';
import '../models/account_model.dart';
import '../token_manager.dart';

/// Adaptador de identidad: guarda los tokens al entrar y traduce los errores a [Failure] con su `code`.
class IdentityRepositoryImpl implements AuthRepository, AccountRepository {
  const IdentityRepositoryImpl(this._remote, this._tokens);

  final IdentityRemoteDataSource _remote;
  final TokenManager _tokens;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (error) {
      throw toFailure(error);
    }
  }

  Future<Account> _signedIn(Map<String, dynamic> json) async {
    await _tokens.store(json);
    return AccountModel.fromJson(json['account'] as Map<String, dynamic>);
  }

  @override
  Stream<void> get sessionEnded => _tokens.sessionEnded;

  @override
  Future<Account?> restore() async {
    if (await _tokens.readRefreshToken() == null) return null;
    if (await _tokens.accessToken() == null) return null;
    return me();
  }

  @override
  Future<SentCode> requestCode(String phone, String language) =>
      _guard(() async => AccountModel.sentCode(await _remote.requestCode(phone, language)));

  @override
  Future<CodeVerification> verifyCode(String challengeId, String code) => _guard(() async {
        final json = await _remote.verifyCode(challengeId, code);
        if (json['status'] == 'REGISTRATION_REQUIRED') {
          return RegistrationRequired(
            registrationToken: json['registrationToken'] as String,
            requiredConsents: AccountModel.legalList(json['requiredConsents']),
          );
        }
        return SignedIn(await _signedIn(json));
      });

  @override
  Future<Account> register({
    required String registrationToken,
    required String givenNames,
    String? familyNames,
    required List<String> acceptedLegalVersionIds,
    required String language,
  }) =>
      _guard(() async => _signedIn(await _remote.register({
            'registrationToken': registrationToken,
            'givenNames': givenNames,
            'familyNames': ?familyNames,
            'acceptedLegalVersionIds': acceptedLegalVersionIds,
            'language': language,
          })));

  @override
  Future<SentCode> startPasswordSignIn(String phone, String password, String language) =>
      _guard(() async => AccountModel.sentCode(await _remote.startPasswordSignIn(phone, password, language)));

  @override
  Future<Account> completePasswordSignIn(String challengeId, String code) =>
      _guard(() async => _signedIn(await _remote.completePasswordSignIn(challengeId, code)));

  @override
  Future<Account> switchRole(Role role, {String? password}) =>
      _guard(() async => _signedIn(await _remote.switchRole(role.apiValue, password)));

  @override
  Future<void> signOut() async {
    final refresh = await _tokens.readRefreshToken();
    try {
      // Revoca en el servidor; si no hay red, la sesión local se borra igual.
      if (refresh != null) await _remote.signOut(refresh);
    } catch (_) {
    } finally {
      await _tokens.clear();
    }
  }

  @override
  Future<Account> me() => _guard(() async => AccountModel.fromJson(await _remote.me()));

  @override
  Future<Account> updateProfile(String givenNames, String? familyNames) =>
      _guard(() async => AccountModel.fromJson(await _remote.updateProfile(givenNames, familyNames)));

  @override
  Future<Account> setLanguage(String language) =>
      _guard(() async => AccountModel.fromJson(await _remote.setLanguage(language)));

  @override
  Future<SentCode> requestPhoneChange(String phone, String language) =>
      _guard(() async => AccountModel.sentCode(await _remote.requestPhoneChange(phone, language)));

  @override
  Future<Account> confirmPhoneChange(String challengeId, String code) =>
      _guard(() async => AccountModel.fromJson(await _remote.confirmPhoneChange(challengeId, code)));

  @override
  Future<Account> acceptConsents(List<String> ids) =>
      _guard(() async => AccountModel.fromJson(await _remote.acceptConsents(ids)));

  @override
  Future<void> changePassword(String currentPassword, String newPassword) =>
      _guard(() => _remote.changePassword(currentPassword, newPassword));

  @override
  Future<void> deleteMyData() => _guard(() async {
        await _remote.deleteMyData();
        await _tokens.clear();
      });
}
