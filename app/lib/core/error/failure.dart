import 'package:equatable/equatable.dart';

/// Error controlado que la capa de presentación sabe mostrar al usuario.
///
/// [code] es el contrato con la API (`errors.<code>` en la web, `errorText` en la app): la vista lo traduce.
class Failure extends Equatable implements Exception {
  const Failure(this.message, {this.code = 'UNKNOWN', this.details = const {}});

  final String message;
  final String code;
  final Map<String, dynamic> details;

  int? get retryAfterSeconds => (details['retryAfterSeconds'] as num?)?.toInt();
  int? get remainingAttempts => (details['remainingAttempts'] as num?)?.toInt();

  @override
  List<Object?> get props => [code, message];
}
