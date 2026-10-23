import '../../auth/presentation/widgets/phone_field.dart';
import '../../establishments/domain/entities/establishment.dart';
import '../domain/entities/order.dart';

/// Nombres sugeridos para guardar un lugar; "custom" deja escribir otro ("Finca", "Donde la abuela").
enum PlaceLabel { home, work, family, custom }

enum RecipientMode { me, saved, other }

enum DraftProblem { point, reference, recipient, payment }

/// Billete con el que paga en efectivo: el valor exacto o un billete (centavos).
sealed class CashWith {
  const CashWith();
}

class ExactCash extends CashWith {
  const ExactCash();
}

class Bill extends CashWith {
  const Bill(this.cents);
  final int cents;

  @override
  bool operator ==(Object other) => other is Bill && other.cents == cents;

  @override
  int get hashCode => cents.hashCode;
}

/// Lo que el cliente va llenando en la pantalla de pedido. Se traduce a la petición solo al cotizar o confirmar.
class CheckoutDraft {
  const CheckoutDraft({
    this.savedAddressId,
    this.point,
    this.reference = '',
    this.line = '',
    this.saveAs,
    this.customLabel = '',
    this.recipientMode = RecipientMode.me,
    this.recipientId,
    this.recipientName = '',
    this.recipientPhone = '',
    this.payment,
    this.cashWith,
    this.notes = '',
  });

  static const minReference = 3;

  /// Arranca marcando el punto: el GPS lo pone donde está el cliente ahora y la dirección del último pedido
  /// queda al lado como opción, sin elegirla (pedir desde otro lugar no debe ir a la casa por descuido).
  /// Sin lugares guardados, el punto nuevo se guarda como "Casa".
  factory CheckoutDraft.start(List<SavedAddress> addresses) => CheckoutDraft(saveAs: addresses.isEmpty ? PlaceLabel.home : null);

  final String? savedAddressId;
  final GeoPoint? point;
  final String reference;
  final String line;
  final PlaceLabel? saveAs;
  final String customLabel;
  final RecipientMode recipientMode;
  final String? recipientId;
  final String recipientName;
  final String recipientPhone;
  final String? payment;
  final CashWith? cashWith;
  final String notes;

  bool get pickingPoint => savedAddressId == null;

  CheckoutDraft copyWith({
    String? Function()? savedAddressId,
    GeoPoint? point,
    String? reference,
    String? line,
    PlaceLabel? Function()? saveAs,
    String? customLabel,
    RecipientMode? recipientMode,
    String? Function()? recipientId,
    String? recipientName,
    String? recipientPhone,
    String? payment,
    CashWith? Function()? cashWith,
    String? notes,
  }) =>
      CheckoutDraft(
        savedAddressId: savedAddressId != null ? savedAddressId() : this.savedAddressId,
        point: point ?? this.point,
        reference: reference ?? this.reference,
        line: line ?? this.line,
        saveAs: saveAs != null ? saveAs() : this.saveAs,
        customLabel: customLabel ?? this.customLabel,
        recipientMode: recipientMode ?? this.recipientMode,
        recipientId: recipientId != null ? recipientId() : this.recipientId,
        recipientName: recipientName ?? this.recipientName,
        recipientPhone: recipientPhone ?? this.recipientPhone,
        payment: payment ?? this.payment,
        cashWith: cashWith != null ? cashWith() : this.cashWith,
        notes: notes ?? this.notes,
      );

  /// Qué falta para confirmar, en el orden de los pasos (la vista lleva al primero).
  List<DraftProblem> get problems => [
        if (pickingPoint && point == null) DraftProblem.point,
        if (pickingPoint && reference.trim().length < minReference) DraftProblem.reference,
        if (recipientMode == RecipientMode.other && (recipientName.trim().length < 2 || !looksLikeMobile(recipientPhone))) DraftProblem.recipient,
        if (recipientMode == RecipientMode.saved && recipientId == null) DraftProblem.recipient,
        if (payment == null) DraftProblem.payment,
      ];

  /// Para cotizar basta el lugar o el punto; null mientras no hay ninguno.
  DeliveryTarget? get quoteTarget => savedAddressId != null ? SavedPlace(savedAddressId!) : point == null ? null : MapPoint(point!);

  DeliveryTarget deliveryTarget(String Function(PlaceLabel) labelText) {
    if (savedAddressId != null) return SavedPlace(savedAddressId!);
    final label = switch (saveAs) {
      null => null,
      PlaceLabel.custom => customLabel.trim().isEmpty ? null : customLabel.trim(),
      final preset => labelText(preset),
    };
    return MapPoint(point!, reference: reference.trim(), line: line.trim().isEmpty ? null : line.trim(), label: label);
  }

  RecipientChoice? get recipient => switch (recipientMode) {
        RecipientMode.me => null,
        RecipientMode.saved => KnownRecipient(recipientId!),
        RecipientMode.other => NewRecipient(fullName: recipientName.trim(), phoneE164: '+57${phoneDigits(recipientPhone)}'),
      };

  /// La nota que lee el domiciliario: primero con qué billete paga (para llevar el cambio), luego lo que escribió.
  String? courierNotes(String Function(CashWith) cashText) {
    final cash = payment == 'CASH' && cashWith != null ? cashText(cashWith!) : null;
    final text = [?cash, if (notes.trim().isNotEmpty) notes.trim()].join('\n');
    return text.isEmpty ? null : text;
  }
}
