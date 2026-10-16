import '../../domain/entities/account.dart';
import '../../domain/entities/sign_in.dart';

/// DTOs: traducen el JSON de la API a entidades de dominio.
class AccountModel {
  static Account fromJson(Map<String, dynamic> json) => Account(
        userId: json['userId'] as String,
        givenNames: json['givenNames'] as String,
        familyNames: json['familyNames'] as String?,
        phone: json['phone'] as String?,
        language: json['language'] as String? ?? 'es',
        roles: (json['roles'] as List).map((r) => RoleX.fromApi(r as String)).whereType<Role>().toList(),
        activeRole: RoleX.fromApi(json['activeRole'] as String) ?? Role.customer,
        pendingConsents: legalList(json['pendingConsents']),
      );

  static List<LegalDocument> legalList(Object? json) => (json as List? ?? const [])
      .cast<Map<String, dynamic>>()
      .map((d) => LegalDocument(
            id: d['id'] as String,
            type: d['documentType'] as String,
            versionLabel: d['versionLabel'] as String,
          ))
      .toList();

  static SentCode sentCode(Map<String, dynamic> json) => SentCode(
        challengeId: json['challengeId'] as String,
        expiresAt: DateTime.parse(json['expiresAt'] as String),
        maskedPhone: json['maskedPhone'] as String,
        devCode: json['devCode'] as String?,
      );
}
