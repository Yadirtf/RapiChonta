import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../core/map/brand_map.dart' show MapHandle;
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/phone_field.dart';
import '../../../business/domain/business.dart' show CoverageArea;
import '../../../business/presentation/business_widgets.dart';
import '../../../establishments/domain/entities/cart.dart';
import '../../../establishments/domain/entities/establishment.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/widgets/storefront.dart';
import '../../domain/entities/order.dart';
import '../checkout_draft.dart';
import 'delivery_pin_map.dart';
import 'order_visuals.dart';
import 'store_page.dart';

/// Zona del punto elegido: calculando, con su tarifa, o fuera de cobertura.
sealed class ZoneState {
  const ZoneState();
}

class ZoneIdle extends ZoneState {
  const ZoneIdle();
}

class ZoneLoading extends ZoneState {
  const ZoneLoading();
}

/// Fuera de cobertura; [distanceMeters] es a cuánto empieza (null si no hay ningún municipio abierto).
class ZoneOutside extends ZoneState {
  const ZoneOutside([this.distanceMeters]);
  final int? distanceMeters;
}

class ZoneFound extends ZoneState {
  const ZoneFound(this.name, this.feeCents);
  final String name;
  final int feeCents;
}

typedef DraftChange = void Function(CheckoutDraft Function(CheckoutDraft) change);

String placeLabelText(AppLocalizations l10n, PlaceLabel label) => switch (label) {
      PlaceLabel.home => l10n.checkoutLabelHome,
      PlaceLabel.work => l10n.checkoutLabelWork,
      PlaceLabel.family => l10n.checkoutLabelFamily,
      PlaceLabel.custom => l10n.checkoutLabelCustom,
    };

IconData _placeIcon(PlaceLabel label) => switch (label) {
      PlaceLabel.home => Icons.home_rounded,
      PlaceLabel.work => Icons.work_rounded,
      PlaceLabel.family => Icons.favorite_rounded,
      PlaceLabel.custom => Icons.edit_rounded,
    };

/// Ícono del lugar guardado por su nombre (Casa, Trabajo…); cualquier otro nombre lleva una etiqueta.
IconData savedPlaceIcon(AppLocalizations l10n, String? label) {
  for (final preset in [PlaceLabel.home, PlaceLabel.work, PlaceLabel.family]) {
    if (placeLabelText(l10n, preset).toLowerCase() == label?.toLowerCase()) return _placeIcon(preset);
  }
  return label == null ? Icons.place_rounded : Icons.sell_rounded;
}

/// Paso 1 (H04.2): un lugar guardado con un toque, u otro punto marcado en el mapa con una referencia de
/// barrio ("casa azul frente al parque"), que es como se encuentra una puerta en Villagarzón.
class DeliverySection extends StatelessWidget {
  const DeliverySection({
    super.key,
    required this.draft,
    required this.onChange,
    required this.addresses,
    required this.zone,
    required this.mapCenter,
    required this.mapController,
    required this.onLocateMe,
    required this.referenceController,
    required this.lineController,
    required this.customLabelController,
    required this.showErrors,
    this.store,
    this.coverage = const [],
  });

  final CheckoutDraft draft;
  final DraftChange onChange;
  final List<SavedAddress> addresses;
  final ZoneState zone;
  final GeoPoint mapCenter;
  final MapHandle mapController;
  final VoidCallback? onLocateMe;
  final TextEditingController referenceController;
  final TextEditingController lineController;
  final TextEditingController customLabelController;
  final bool showErrors;
  final GeoPoint? store;
  final List<CoverageArea> coverage;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (addresses.isNotEmpty) ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final address in addresses)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 150, maxWidth: 220),
                      child: ChoiceTile(
                        selected: draft.savedAddressId == address.id,
                        onTap: () => onChange((d) => d.copyWith(savedAddressId: () => address.id)),
                        child: Row(
                          children: [
                            Icon(savedPlaceIcon(l10n, address.label), color: AppColors.chonta, size: 20),
                            const SizedBox(width: 10),
                            Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(address.label ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
                                  Text(address.reference ?? address.line ?? '',
                                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.ink.withValues(alpha: 0.55))),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ChoiceTile(
                  selected: draft.pickingPoint,
                  onTap: () => onChange((d) => d.copyWith(savedAddressId: () => null)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
                  child: Row(children: [const Icon(Icons.add_rounded, color: AppColors.chonta), const SizedBox(width: 6), Text(l10n.checkoutOtherPlace)]),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        if (draft.pickingPoint) ..._picker(context, l10n) else _ZoneLine(zone: zone),
      ],
    );
  }

  List<Widget> _picker(BuildContext context, AppLocalizations l10n) {
    final language = Localizations.localeOf(context).languageCode;
    final label = switch (zone) {
      ZoneOutside() => _Pill(color: AppColors.chontaStrong, foreground: Colors.white, icon: Icons.wrong_location_rounded, text: l10n.checkoutOutsideShort),
      ZoneFound(:final name, :final feeCents) => PriceTag(label: '$name · ${formatPesos(feeCents, language)}', fontSize: 12),
      _ => _Pill(color: Colors.white, foreground: AppColors.ink.withValues(alpha: 0.6), text: l10n.checkoutCheckingZone),
    };
    final referenceMissing = showErrors && draft.reference.trim().length < CheckoutDraft.minReference;
    return [
      ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: 280,
          child: Stack(
            children: [
              DeliveryPinMap(
                center: draft.point ?? mapCenter,
                controller: mapController,
                store: store,
                label: label,
                coverage: coverage,
                onPick: (point) => onChange((d) => d.copyWith(point: point)),
              ),
              Positioned(
                top: 10,
                left: 10,
                right: 10,
                child: Center(child: _Pill(color: Colors.white, foreground: AppColors.ink.withValues(alpha: 0.7), text: l10n.checkoutMapHint)),
              ),
              if (onLocateMe != null)
                Positioned(
                  left: 10,
                  bottom: 10,
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(99),
                    elevation: 3,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(99),
                      onTap: onLocateMe,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        child: Row(children: [
                          const Icon(Icons.my_location_rounded, size: 18, color: AppColors.chonta),
                          const SizedBox(width: 6),
                          Text(l10n.checkoutUseMyLocation, style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      if (zone case ZoneOutside(:final distanceMeters)) ...[const SizedBox(height: 12), _OutsideNotice(distanceMeters: distanceMeters)],
      const SizedBox(height: 16),
      TextField(
        controller: referenceController,
        maxLength: 200,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(
          labelText: l10n.checkoutReference,
          hintText: l10n.checkoutReferencePlaceholder,
          helperText: l10n.checkoutReferenceHint,
          helperMaxLines: 2,
          errorText: referenceMissing ? l10n.checkoutMissingReference : null,
          counterText: '',
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: lineController,
        maxLength: 200,
        decoration: InputDecoration(labelText: l10n.checkoutLine, hintText: l10n.checkoutLinePlaceholder, counterText: ''),
      ),
      const SizedBox(height: 16),
      Text(l10n.checkoutSaveAs, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final preset in PlaceLabel.values)
            ChoiceTile(
              selected: draft.saveAs == preset,
              onTap: () => onChange((d) => d.copyWith(saveAs: () => preset)),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(_placeIcon(preset), size: 18, color: AppColors.chonta),
                const SizedBox(width: 6),
                Text(placeLabelText(l10n, preset)),
              ]),
            ),
          ChoiceTile(
            selected: draft.saveAs == null,
            onTap: () => onChange((d) => d.copyWith(saveAs: () => null)),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Text(l10n.checkoutDontSave),
          ),
        ],
      ),
      if (draft.saveAs == PlaceLabel.custom) ...[
        const SizedBox(height: 12),
        TextField(
          controller: customLabelController,
          maxLength: 40,
          decoration: InputDecoration(labelText: l10n.checkoutLabelCustom, hintText: l10n.checkoutLabelPlaceholder, counterText: ''),
        ),
      ],
    ];
  }
}

class _ZoneLine extends StatelessWidget {
  const _ZoneLine({required this.zone});

  final ZoneState zone;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    if (zone case ZoneOutside(:final distanceMeters)) return _OutsideNotice(distanceMeters: distanceMeters);
    final text = switch (zone) {
      ZoneFound(:final name, :final feeCents) => l10n.checkoutZoneFee(name, formatPesos(feeCents, language)),
      _ => l10n.checkoutCheckingZone,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: AppColors.leaf.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        const Icon(Icons.delivery_dining_rounded, color: AppColors.leaf, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(color: AppColors.leaf, fontWeight: FontWeight.w700))),
      ]),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.detail});

  final String text;
  final String? detail;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(16)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.wrong_location_rounded, color: AppColors.chontaStrong, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700)),
              if (detail != null) ...[
                const SizedBox(height: 2),
                Text(detail!, style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w900)),
              ],
            ]),
          ),
        ]),
      );
}

/// Fuera de cobertura: además de decirlo, cuánto falta ("a 600 m"), porque en un pueblo eso suele ser una
/// esquina más allá y el cliente puede mover el pin hasta donde lo encuentre el domiciliario.
class _OutsideNotice extends StatelessWidget {
  const _OutsideNotice({required this.distanceMeters});

  final int? distanceMeters;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final meters = distanceMeters;
    final language = Localizations.localeOf(context).languageCode;
    return _Notice(
      text: l10n.checkoutOutsideZone,
      detail: meters != null && meters > 0 ? l10n.checkoutOutsideDistance(formatDistance(meters, language)) : null,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.color, required this.foreground, required this.text, this.icon});

  final Color color;
  final Color foreground;
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(99),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.15), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: 4)],
          Flexible(child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w700))),
        ]),
      );
}

/// Paso 2 (H04.2): el pedido puede ser para otra persona (la mamá, un vecino). A quien ya se le envió queda
/// a un toque; el número solo lo ve el domiciliario cuando va en camino.
class RecipientSection extends StatelessWidget {
  const RecipientSection({
    super.key,
    required this.draft,
    required this.onChange,
    required this.recipients,
    required this.myPhone,
    required this.nameController,
    required this.phoneController,
    required this.showErrors,
  });

  final CheckoutDraft draft;
  final DraftChange onChange;
  final List<SavedRecipient> recipients;
  final String? myPhone;
  final TextEditingController nameController;
  final TextEditingController phoneController;
  final bool showErrors;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final forSomeone = draft.recipientMode != RecipientMode.me;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<bool>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: false, icon: const Icon(Icons.person_rounded), label: Text(l10n.checkoutForMe)),
            ButtonSegment(value: true, icon: const Icon(Icons.people_alt_rounded), label: Text(l10n.checkoutForSomeone)),
          ],
          selected: {forSomeone},
          onSelectionChanged: (value) => onChange((d) => value.first
              ? d.copyWith(
                  recipientMode: recipients.isEmpty ? RecipientMode.other : RecipientMode.saved,
                  recipientId: () => recipients.firstOrNull?.id,
                )
              : d.copyWith(recipientMode: RecipientMode.me)),
        ),
        const SizedBox(height: 12),
        if (!forSomeone && myPhone != null)
          Text(l10n.checkoutForMeHint(formatPhone(myPhone)), style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
        if (forSomeone && recipients.isNotEmpty) ...[
          Text(l10n.checkoutSavedRecipients, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final person in recipients)
                ChoiceTile(
                  selected: draft.recipientMode == RecipientMode.saved && draft.recipientId == person.id,
                  onTap: () => onChange((d) => d.copyWith(recipientMode: RecipientMode.saved, recipientId: () => person.id)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.chonta.withValues(alpha: 0.15),
                      child: Text(_initials(person.fullName), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: AppColors.chontaStrong)),
                    ),
                    const SizedBox(width: 8),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(person.fullName),
                      Text(formatPhone(person.phone), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.ink.withValues(alpha: 0.55))),
                    ]),
                  ]),
                ),
              ChoiceTile(
                selected: draft.recipientMode == RecipientMode.other,
                onTap: () => onChange((d) => d.copyWith(recipientMode: RecipientMode.other)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 17),
                child: Text(l10n.checkoutNewRecipient),
              ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (draft.recipientMode == RecipientMode.other) ...[
          TextField(
            controller: nameController,
            maxLength: 120,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: l10n.checkoutRecipientName,
              counterText: '',
              errorText: showErrors && draft.recipientName.trim().length < 2 ? l10n.checkoutMissingRecipient : null,
            ),
          ),
          const SizedBox(height: 12),
          PhoneField(
            controller: phoneController,
            label: l10n.checkoutRecipientPhone,
            helperText: l10n.checkoutRecipientHint,
            errorText: showErrors && !looksLikeMobile(draft.recipientPhone) ? l10n.checkoutMissingRecipientPhone : null,
          ),
        ],
      ],
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '·';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }
}

/// Paso 3 (RF-22): se paga contra entrega. En efectivo el cliente dice con qué billete paga para que el
/// domiciliario lleve el cambio; con Nequi, Daviplata o transferencia se paga con el QR o el número que le muestra.
class PaymentSection extends StatelessWidget {
  const PaymentSection({super.key, required this.draft, required this.onChange, required this.methods, required this.totalCents, required this.notesController, required this.showErrors});

  /// La API admite 500; se reservan 40 para "Pago con $ 100.000" que va delante.
  static const notesMax = 460;

  final CheckoutDraft draft;
  final DraftChange onChange;
  final List<String> methods;
  final int? totalCents;
  final TextEditingController notesController;
  final bool showErrors;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final bills = totalCents == null ? const <int>[] : OrderRules.cashSuggestions(totalCents!);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.checkoutPayHint, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) => Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final method in methods)
                SizedBox(width: (constraints.maxWidth - 10) / 2, child: _PaymentTile(method: method, selected: draft.payment == method, onTap: () => onChange((d) => d.copyWith(payment: method)))),
            ],
          ),
        ),
        if (showErrors && draft.payment == null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(l10n.checkoutMissingPayment, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
          ),
        if (draft.payment == 'CASH') ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(20)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l10n.checkoutCashChange, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                ChoiceTile(
                  selected: draft.cashWith is ExactCash,
                  onTap: () => onChange((d) => d.copyWith(cashWith: () => const ExactCash())),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text(l10n.checkoutCashExact),
                ),
                for (final cents in bills)
                  ChoiceTile(
                    selected: draft.cashWith == Bill(cents),
                    onTap: () => onChange((d) => d.copyWith(cashWith: () => Bill(cents))),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Text(formatPesos(cents, language)),
                  ),
              ]),
            ]),
          ),
        ],
        if (draft.payment != null && draft.payment != 'CASH') ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(16)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.chonta),
              const SizedBox(width: 8),
              Expanded(
                child: Text(draft.payment == 'BANK_TRANSFER' ? l10n.checkoutTransferHint : l10n.checkoutWalletHint(paymentLabel(l10n, draft.payment!)),
                    style: TextStyle(color: AppColors.ink.withValues(alpha: 0.7))),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: notesController,
          maxLength: notesMax,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(labelText: l10n.checkoutNotes, hintText: l10n.checkoutNotesPlaceholder, alignLabelWithHint: true),
        ),
      ],
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.method, required this.selected, required this.onTap});

  final String method;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        inMutuallyExclusiveGroup: true,
        button: true,
        child: Material(
          color: selected ? AppColors.brand : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
            side: BorderSide(color: selected ? AppColors.ink : AppColors.ink.withValues(alpha: 0.1), width: 2),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: selected ? AppColors.ink : AppColors.cream, borderRadius: BorderRadius.circular(14)),
                    child: Icon(paymentIcon(method), color: selected ? AppColors.brand : AppColors.chonta, size: 20),
                  ),
                  const Spacer(),
                  if (selected)
                    const CircleAvatar(radius: 11, backgroundColor: AppColors.ink, child: Icon(Icons.check_rounded, size: 14, color: AppColors.brand)),
                ]),
                const SizedBox(height: 12),
                Text(paymentLabel(AppLocalizations.of(context), method), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
              ]),
            ),
          ),
        ),
      );
}

/// La comanda: lo que el domiciliario va a comprar, con una nota por producto, y el total que se paga al
/// recibir. Los valores salen de la cotización de la API (precio vigente y tarifa de la zona).
class ReceiptSection extends StatelessWidget {
  const ReceiptSection({super.key, required this.cart, required this.quote, required this.zone, required this.onNote, this.footer});

  final Cart cart;
  final OrderQuote? quote;
  final ZoneState zone;
  final void Function(CartLine line) onNote;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final itemsCents = quote?.itemsCents ?? cart.subtotalCents;
    final feeCents = quote != null && zone is ZoneFound ? quote!.feeCents : null;
    final totalCents = feeCents == null ? null : itemsCents + feeCents;
    final muted = AppColors.ink.withValues(alpha: 0.6);

    return ClipPath(
      clipper: const ReceiptClipper(),
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l10n.checkoutReceipt.toUpperCase(), style: const TextStyle(color: AppColors.chonta, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
                  const SizedBox(height: 2),
                  Row(children: [
                    const Icon(Icons.storefront_rounded, size: 18),
                    const SizedBox(width: 6),
                    Flexible(child: Text(cart.establishmentName, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900))),
                  ]),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(99)),
                child: Text(l10n.checkoutItems(cart.count), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: muted)),
              ),
            ]),
            const _Dashes(),
            for (final line in cart.lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(width: 32, child: Text('${line.quantity}×', style: const TextStyle(color: AppColors.chonta, fontWeight: FontWeight.w900))),
                    Expanded(child: Text(line.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                    Text(formatPesos(line.priceCents * line.quantity, language), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ]),
                  Padding(
                    padding: const EdgeInsets.only(left: 32),
                    child: InkWell(
                      onTap: () => onNote(line),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          Icon(Icons.sticky_note_2_outlined, size: 15, color: AppColors.ink.withValues(alpha: 0.5)),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              line.notes ?? l10n.checkoutAddNote,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                fontStyle: line.notes == null ? FontStyle.normal : FontStyle.italic,
                                color: AppColors.ink.withValues(alpha: line.notes == null ? 0.5 : 0.7),
                              ),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ]),
              ),
            const _Dashes(),
            _Amount(label: l10n.checkoutProducts, value: formatPesos(itemsCents, language)),
            _Amount(
              label: zone is ZoneFound ? '${l10n.checkoutDelivery} · ${(zone as ZoneFound).name}' : l10n.checkoutDelivery,
              value: feeCents == null ? l10n.checkoutDeliveryPending : formatPesos(feeCents, language),
              muted: feeCents == null,
            ),
            const SizedBox(height: 6),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: Text(l10n.checkoutTotal, style: const TextStyle(fontWeight: FontWeight.w800))),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(formatPesos(totalCents ?? itemsCents, language), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.8)),
                if (totalCents != null) ApproxPrice(cents: totalCents),
              ]),
            ]),
            if (quote != null && quote!.prepMinutes > 0) ...[
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.schedule_rounded, size: 15, color: muted),
                const SizedBox(width: 4),
                Expanded(child: Text(l10n.checkoutPrep(quote!.prepMinutes), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: muted))),
              ]),
            ],
            if (quote?.newCustomerLimit != null) _FirstOrderMeter(limit: quote!.newCustomerLimit!, itemsCents: itemsCents),
            ?footer,
          ],
        ),
      ),
    );
  }
}

class _Amount extends StatelessWidget {
  const _Amount({required this.label, required this.value, this.muted = false});

  final String label;
  final String value;
  final bool muted;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6)))),
          Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: muted ? AppColors.ink.withValues(alpha: 0.4) : AppColors.ink)),
        ]),
      );
}

/// Tope del primer pedido (RF-22): un brote que crece hasta el límite. Cuenta lo de este pedido más lo que
/// ya está en camino, porque el tope es por cliente nuevo y no por pedido.
class _FirstOrderMeter extends StatelessWidget {
  const _FirstOrderMeter({required this.limit, required this.itemsCents});

  final NewCustomerLimit limit;
  final int itemsCents;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final used = ((limit.limitCents - limit.availableCents + itemsCents) / (limit.limitCents == 0 ? 1 : limit.limitCents)).clamp(0.0, 1.0);
    final color = limit.exceeded ? AppColors.chonta : AppColors.leaf;
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: limit.exceeded ? AppColors.chontaSoft : AppColors.leaf.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.spa_rounded, size: 18, color: limit.exceeded ? AppColors.chontaStrong : AppColors.leaf),
          const SizedBox(width: 6),
          Text(l10n.checkoutFirstOrderTitle, style: TextStyle(fontWeight: FontWeight.w900, color: limit.exceeded ? AppColors.chontaStrong : AppColors.leaf)),
        ]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(9),
          child: LinearProgressIndicator(value: used, minHeight: 8, backgroundColor: Colors.white, color: color),
        ),
        const SizedBox(height: 8),
        Text(
          limit.exceeded
              ? l10n.checkoutFirstOrderExceeded(formatPesos(itemsCents - limit.availableCents, language))
              : l10n.checkoutFirstOrderBody(formatPesos(limit.limitCents, language), formatPesos(limit.availableCents, language)),
          style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.7)),
        ),
      ]),
    );
  }
}

class _Dashes extends StatelessWidget {
  const _Dashes();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: LayoutBuilder(
          builder: (context, constraints) => Row(
            children: [
              for (var i = 0; i < constraints.maxWidth ~/ 9; i++)
                Container(width: 5, height: 2, margin: const EdgeInsets.only(right: 4), color: AppColors.ink.withValues(alpha: 0.15)),
            ],
          ),
        ),
      );
}
