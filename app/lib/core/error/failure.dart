import 'package:equatable/equatable.dart';

/// Error controlado que la capa de presentación sabe mostrar al usuario.
class Failure extends Equatable implements Exception {
  const Failure(this.message);

  final String message;

  @override
  List<Object?> get props => [message];
}
