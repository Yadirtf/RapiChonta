import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/establishment.dart';
import '../providers/establishments_providers.dart';
import 'category_label.dart';

const _icons = {
  EstablishmentCategory.fastFood: Icons.fastfood_rounded,
  EstablishmentCategory.restaurant: Icons.restaurant_rounded,
  EstablishmentCategory.supermarket: Icons.local_grocery_store_rounded,
  EstablishmentCategory.store: Icons.storefront_rounded,
  EstablishmentCategory.pharmacy: Icons.local_pharmacy_rounded,
};

/// Menú lateral. En teléfonos se muestra como Drawer; en tabletas, fijo a la izquierda (igual que la web).
class SideMenu extends ConsumerWidget {
  const SideMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedCategoriesProvider);
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(sessionProvider).value;

    return Container(
      width: 280,
      color: AppColors.ink,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 24, 20, 16),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: 'Rapi', style: TextStyle(color: Colors.white)),
                  TextSpan(text: 'Chonta', style: TextStyle(color: AppColors.brand)),
                ]),
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
            ),
            for (final category in EstablishmentCategory.values)
              _MenuItem(
                icon: _icons[category]!,
                label: category.label(l10n),
                active: selected.contains(category),
                onTap: () => ref.read(selectedCategoriesProvider.notifier).toggle(category),
              ),
            const Spacer(),
            const Divider(color: Colors.white12),
            _MenuItem(icon: Icons.delivery_dining_rounded, label: l10n.menuMyOrders, onTap: () {}),
            _MenuItem(
              icon: Icons.person_rounded,
              label: account?.givenNames ?? l10n.menuMyAccount,
              onTap: () {
                Scaffold.maybeOf(context)?.closeDrawer();
                context.push('/cuenta');
              },
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.icon, required this.label, required this.onTap, this.active = false});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: active ? AppColors.brand.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: active ? AppColors.brand.withValues(alpha: 0.4) : Colors.transparent),
        ),
        child: ListTile(
          onTap: onTap,
          leading: Icon(icon, color: active ? AppColors.brand : Colors.white70),
          title: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }
}
