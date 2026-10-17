import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../format/money.dart';
import '../providers/establishments_providers.dart';
import 'storefront.dart';
import '../../../business/presentation/business_providers.dart';
import '../../../business/presentation/business_widgets.dart';

/// Barra con borde de recibo: cuántos productos van y cuánto suman. Toca para ver la canasta.
class CartBar extends ConsumerWidget {
  const CartBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final status = ref.watch(businessStatusProvider).value;
    // Fuera de horario la barra dice cuándo abrimos, en vez del nombre del local (H03.2).
    final closed = status == null || status.open ? null : openingText(l10n, status, language).detail;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      transitionBuilder: (child, animation) => SlideTransition(
        position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(animation),
        child: child,
      ),
      child: cart == null
          ? const SizedBox.shrink()
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: ClipPath(
                  clipper: const ReceiptClipper(),
                  child: Material(
                    color: AppColors.ink,
                    borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
                    child: InkWell(
                      onTap: () => showCartSheet(context),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 20, 18, 14),
                        child: Row(
                          children: [
                            Badge(
                              label: Text('${cart.count}'),
                              backgroundColor: Colors.white,
                              textColor: AppColors.ink,
                              child: Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(14)),
                                child: const Icon(Icons.shopping_basket_rounded, color: AppColors.ink),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(l10n.cartView, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                                  Text(closed ?? cart.establishmentName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(color: closed == null ? Colors.white60 : AppColors.brand, fontSize: 12, fontWeight: closed == null ? null : FontWeight.w700)),
                                ],
                              ),
                            ),
                            Text(formatPesos(cart.subtotalCents, language),
                                style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w900, fontSize: 18)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

Future<void> showCartSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => const _CartSheet(),
    );

class _CartSheet extends ConsumerWidget {
  const _CartSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    if (cart == null) {
      return SizedBox(
        height: 200,
        child: Center(child: Text(l10n.cartTitle, style: Theme.of(context).textTheme.titleMedium)),
      );
    }
    final notifier = ref.read(cartProvider.notifier);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.92,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          Text(l10n.cartTitle, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          TextButton.icon(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, alignment: Alignment.centerLeft),
            onPressed: () {
              Navigator.of(context).pop();
              context.push('/local/${cart.establishmentId}');
            },
            icon: const Icon(Icons.storefront_rounded, size: 18),
            label: Text(cart.establishmentName),
          ),
          const SizedBox(height: 8),
          for (final line in cart.lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 52,
                      height: 52,
                      child: line.imageUrl == null
                          ? const ColoredBox(color: AppColors.surface, child: Icon(Icons.shopping_basket_outlined, color: Colors.black26))
                          : Image.network(line.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const ColoredBox(color: AppColors.surface)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(line.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Row(
                          children: [
                            Text(formatPesos(line.priceCents, language), style: const TextStyle(color: Colors.black54)),
                            const SizedBox(width: 6),
                            Flexible(child: ApproxPrice(cents: line.priceCents, fontSize: 11)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  QuantityStepper(quantity: line.quantity, onChanged: (q) => notifier.setQuantity(line.productId, q)),
                ],
              ),
            ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(22)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(l10n.cartSubtotal(cart.count), style: const TextStyle(fontWeight: FontWeight.w600))),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(formatPesos(cart.subtotalCents, language), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        ApproxPrice(cents: cart.subtotalCents),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(l10n.cartFeeLater, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const OpeningSign(),
          const SizedBox(height: 12),
          FilledButton(onPressed: null, child: Text(l10n.cartCheckout)),
          const SizedBox(height: 6),
          Center(child: Text(l10n.cartCheckoutSoon, style: const TextStyle(fontSize: 12, color: Colors.black45))),
          TextButton(
            onPressed: () {
              notifier.clear();
              Navigator.of(context).pop();
            },
            child: Text(l10n.cartClear),
          ),
        ],
      ),
    );
  }
}

/// − cantidad + ; con una unidad, restar se vuelve "quitar".
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.quantity, required this.onChanged, this.brand = false});

  final int quantity;
  final ValueChanged<int> onChanged;
  final bool brand;

  @override
  Widget build(BuildContext context) => Container(
        height: 40,
        decoration: BoxDecoration(
          color: brand ? AppColors.brand : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: brand ? [BoxShadow(color: AppColors.ink.withValues(alpha: 0.15), blurRadius: 8, offset: const Offset(0, 3))] : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              visualDensity: VisualDensity.compact,
              iconSize: 18,
              onPressed: () => onChanged(quantity - 1),
              icon: Icon(quantity == 1 ? Icons.delete_outline_rounded : Icons.remove_rounded),
            ),
            Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            IconButton(
              visualDensity: VisualDensity.compact,
              iconSize: 18,
              onPressed: quantity >= 20 ? null : () => onChanged(quantity + 1),
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
      );
}
