import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../business/presentation/business_widgets.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/establishments_providers.dart';
import 'category_icon.dart';

/// Menú lateral. En teléfonos se muestra como Drawer; en tabletas, fijo a la izquierda (igual que la web).
class SideMenu extends ConsumerWidget {
  const SideMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedCategoriesProvider);
    final categories = ref.watch(categoriesProvider);
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final account = ref.watch(sessionProvider).value;

    return Container(
      width: 280,
      color: AppColors.ink,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(padding: EdgeInsets.fromLTRB(20, 24, 20, 16), child: BrandLogo()),
            _MenuItem(
              icon: Icons.grid_view_rounded,
              label: l10n.categoryAll,
              active: selected.isEmpty,
              onTap: () => ref.read(selectedCategoriesProvider.notifier).clear(),
            ),
            // Categorías del catálogo: las define el administrador desde el panel.
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  for (final category in categories.value ?? const [])
                    _MenuItem(
                      icon: categoryIcon(category.icon),
                      label: category.name(language),
                      active: selected.contains(category.code),
                      onTap: () => ref.read(selectedCategoriesProvider.notifier).toggle(category.code),
                    ),
                  if (categories.isLoading)
                    const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand))),
                ],
              ),
            ),
            const Divider(color: Colors.white12),
            const Padding(padding: EdgeInsets.fromLTRB(24, 8, 16, 4), child: OpeningSign(dark: true)),
            const Padding(padding: EdgeInsets.fromLTRB(20, 4, 16, 4), child: CurrencyPicker()),
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
