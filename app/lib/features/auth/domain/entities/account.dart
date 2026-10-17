import 'package:equatable/equatable.dart';

/// Roles del catálogo `roles` (la API los verifica al arrancar).
enum Role { customer, courier, operator, admin }

extension RoleX on Role {
  String get apiValue => switch (this) {
        Role.customer => 'CUSTOMER',
        Role.courier => 'COURIER',
        Role.operator => 'OPERATOR',
        Role.admin => 'ADMIN',
      };

  /// Roles que entran con contraseña + código (roles.requires_password).
  bool get requiresPassword => this != Role.customer;

  static Role? fromApi(String value) => Role.values.where((r) => r.apiValue == value).firstOrNull;
}

/// Documento legal vigente que el usuario debe aceptar (legal_document_versions).
class LegalDocument extends Equatable {
  const LegalDocument({required this.id, required this.type, required this.versionLabel});

  final String id;

  /// TERMS_OF_SERVICE, DATA_PROCESSING_POLICY o COURIER_LOCATION_AUTHORIZATION.
  final String type;
  final String versionLabel;

  @override
  List<Object?> get props => [id];
}

/// Lo que la API devuelve del usuario autenticado (GET /me).
class Account extends Equatable {
  const Account({
    required this.userId,
    required this.givenNames,
    required this.familyNames,
    required this.phone,
    required this.language,
    required this.roles,
    required this.activeRole,
    required this.pendingConsents,
    this.displayCurrency,
  });

  final String userId;
  final String givenNames;
  final String? familyNames;
  final String? phone;
  final String language;
  final List<Role> roles;
  final Role activeRole;
  final List<LegalDocument> pendingConsents;

  /// Moneda del precio aproximado ('USD', 'EUR') o null para ver solo pesos (H03.4).
  final String? displayCurrency;

  String get fullName => [givenNames, if (familyNames != null) familyNames].join(' ');
  String get initials => [givenNames, familyNames ?? '']
      .where((p) => p.trim().isNotEmpty)
      .map((p) => p.trim()[0].toUpperCase())
      .take(2)
      .join();

  bool get usesPassword => roles.any((r) => r.requiresPassword);

  /// RF-06: solo quien tiene el rol de domiciliario ve el cambio de modo.
  bool get canSwitchMode => roles.contains(Role.courier) && roles.contains(Role.customer);

  @override
  List<Object?> get props => [userId, givenNames, familyNames, phone, language, roles, activeRole, pendingConsents, displayCurrency];
}
