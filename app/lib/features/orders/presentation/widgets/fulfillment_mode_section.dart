import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/order.dart';

/// E15 · H15.2: en un comercio aliado el cliente elige cómo le llega el pedido. Directo (el local lo prepara y el
/// domiciliario lo recoge) o la compra de siempre. Mismo precio y mismo domicilio; solo cambia quién lo arma.
class FulfillmentModeSection extends StatelessWidget {
  const FulfillmentModeSection({super.key, required this.modes, required this.selected, required this.store, required this.onSelect});

  final List<String> modes;
  final String selected;
  final String store;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final mode in modes)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _ModeCard(mode: mode, store: store, selected: mode == selected, onTap: () => onSelect(mode)),
        ),
      Text(l10n.checkoutModeSamePrice, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
    ]);
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({required this.mode, required this.store, required this.selected, required this.onTap});

  final String mode;
  final String store;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final direct = mode == directFulfillmentMode;
    final tone = direct ? AppColors.leaf : AppColors.chonta;
    final title = direct ? l10n.checkoutModeDirectTitle(store) : l10n.checkoutModePurchaseTitle;
    final body = direct ? l10n.checkoutModeDirectBody(store) : l10n.checkoutModePurchaseBody(store);
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected ? tone.withValues(alpha: 0.08) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: selected ? tone : AppColors.ink.withValues(alpha: 0.1), width: selected ? 2 : 1.2),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: tone, borderRadius: BorderRadius.circular(14)),
                child: Icon(direct ? Icons.handshake_rounded : Icons.shopping_bag_rounded, color: Colors.white, size: 23),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
                    if (direct) _PartnerStamp(label: l10n.checkoutModePartner),
                  ]),
                  const SizedBox(height: 3),
                  Text(body, style: TextStyle(fontSize: 13, height: 1.3, color: AppColors.ink.withValues(alpha: 0.65))),
                ]),
              ),
              const SizedBox(width: 8),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? tone : Colors.transparent,
                  border: Border.all(color: selected ? tone : AppColors.ink.withValues(alpha: 0.25), width: 2),
                ),
                child: selected ? const Icon(Icons.check_rounded, size: 15, color: Colors.white) : null,
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// El sello de "Aliado", inclinado como el de la web.
class _PartnerStamp extends StatelessWidget {
  const _PartnerStamp({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: -0.06,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(border: Border.all(color: AppColors.leaf, width: 1.5), borderRadius: BorderRadius.circular(6)),
          child: Text(label.toUpperCase(), style: const TextStyle(color: AppColors.leaf, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        ),
      );
}
