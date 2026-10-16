import '../entities/account.dart';
import '../entities/sign_in.dart';

/// Mi cuenta (H01.5): todo opera sobre el usuario de la sesión.
abstract interface class AccountRepository {
  Future<Account> me();
  Future<Account> updateProfile(String givenNames, String? familyNames);
  Future<Account> setLanguage(String language);
  Future<SentCode> requestPhoneChange(String phone, String language);
  Future<Account> confirmPhoneChange(String challengeId, String code);
  Future<Account> acceptConsents(List<String> legalDocumentVersionIds);
  Future<void> changePassword(String currentPassword, String newPassword);
  Future<void> deleteMyData();
}
