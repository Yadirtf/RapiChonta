import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/establishment.dart';
import '../format/money.dart';
import 'cart_bar.dart';
import 'category_icon.dart';
import 'storefront.dart';
import '../../../business/presentation/business_widgets.dart';

/// Producto con su etiqueta de precio colgada y el tiempo de preparación; agotado = sello encima.
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.quantity,
    required this.canOrder,
    required this.placeholderIcon,
    required this.onAdd,
    required this.onQuantity,
  });

  final MenuProduct product;
  final int quantity;
  final bool canOrder;
  final String placeholderIcon;
  final VoidCallback onAdd;
  final ValueChanged<int> onQuantity;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final soldOut = !product.orderable;
    final grey = soldOut ? const ColorFilter.mode(Colors.grey, BlendMode.saturation) : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: quantity > 0 ? AppColors.brand : Colors.transparent, width: 2),
        boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      padding: const EdgeInsets.fromLTRB(0, 16, 14, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    PriceTag(label: formatPesos(product.priceCents, language), muted: soldOut),
                    const SizedBox(width: 8),
                    Flexible(child: ApproxPrice(cents: product.priceCents)),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(product.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, height: 1.2)),
                      if (product.description != null) ...[
                        const SizedBox(height: 4),
                        Text(product.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black54, fontSize: 13)),
                      ],
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (product.prepMinutes > 0)
                            _Chip(icon: Icons.soup_kitchen_outlined, label: l10n.prepMinutes(product.prepMinutes)),
                          if (soldOut) _Chip(label: l10n.soldOut.toUpperCase(), dark: true),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            width: 112,
            height: 124,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: ColorFiltered(
                    colorFilter: grey ?? const ColorFilter.mode(Colors.transparent, BlendMode.dst),
                    child: SizedBox(
                      width: 112,
                      height: 112,
                      child: product.imageUrl == null
                          ? ColoredBox(
                              color: AppColors.cream,
                              child: Icon(categoryIcon(placeholderIcon), size: 40, color: AppColors.brandStrong.withValues(alpha: 0.4)),
                            )
                          : Image.network(product.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const ColoredBox(color: AppColors.cream)),
                    ),
                  ),
                ),
                if (soldOut)
                  Positioned.fill(
                    bottom: 12,
                    child: Center(
                      child: Transform.rotate(
                        angle: -0.2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.85),
                            border: Border.all(color: Colors.red.shade600, width: 2),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(l10n.soldOut.toUpperCase(),
                              style: TextStyle(color: Colors.red.shade600, fontWeight: FontWeight.w900, letterSpacing: 1.5, fontSize: 12)),
                        ),
                      ),
                    ),
                  ),
                if (canOrder && !soldOut)
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: quantity > 0
                          ? QuantityStepper(quantity: quantity, onChanged: onQuantity, brand: true)
                          : Semantics(
                              button: true,
                              label: l10n.addToCart(product.name),
                              child: Material(
                                color: AppColors.ink,
                                shape: const CircleBorder(side: BorderSide(color: Colors.white, width: 4)),
                                elevation: 4,
                                child: InkWell(
                                  customBorder: const CircleBorder(),
                                  onTap: onAdd,
                                  child: const SizedBox(width: 44, height: 44, child: Icon(Icons.add_rounded, color: AppColors.brand, size: 26)),
                                ),
                              ),
                            ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.dark = false});

  final String label;
  final IconData? icon;
  final bool dark;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: dark ? AppColors.ink : AppColors.surface, borderRadius: BorderRadius.circular(20)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 14, color: Colors.black54), const SizedBox(width: 4)],
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: dark ? Colors.white : Colors.black87)),
          ],
        ),
      );
}
