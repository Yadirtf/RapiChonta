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

    return SizedBox(
      width: 280,
      child: _GlassBackdrop(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(padding: EdgeInsets.fromLTRB(20, 20, 20, 14), child: Center(child: BrandEmblem(width: 120))),
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
              const Divider(color: Colors.white24),
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
      ),
    );
  }
}

/// Paisaje de Villagarzón bajo un vidrio oscuro (igual que la web, .sidebar-glass en web/src/app/globals.css).
/// El vidrio es más claro arriba, donde solo está el emblema; desde ~170 px tiene al menos 62 % de tinta,
/// así el texto blanco al 70 % y el amarillo de marca superan 4.5:1 (WCAG AA) sobre el punto más claro.
class _GlassBackdrop extends StatelessWidget {
  const _GlassBackdrop({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight.isFinite && constraints.maxHeight > 300 ? constraints.maxHeight : 800.0;
        final topInset = MediaQuery.paddingOf(context).top;
        double at(double px) => ((px + topInset) / height).clamp(0.0, 1.0);
        return DecoratedBox(
          decoration: const BoxDecoration(
            color: AppColors.ink,
            image: DecorationImage(image: AssetImage(BrandAssets.sidebarScene), fit: BoxFit.cover, alignment: Alignment(0, -0.3)),
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppColors.ink.withValues(alpha: 0.35),
                  AppColors.ink.withValues(alpha: 0.5),
                  AppColors.ink.withValues(alpha: 0.64),
                  AppColors.ink.withValues(alpha: 0.68),
                  AppColors.ink.withValues(alpha: 0.72),
                ],
                stops: [0, at(110), at(170), at(300), 1],
              ),
              // Canto del vidrio.
              border: const Border(right: BorderSide(color: Colors.white10)),
            ),
            child: DecoratedBox(
              // Resplandor del atardecer detrás del emblema.
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topCenter,
                  radius: 0.9,
                  colors: [AppColors.brand.withValues(alpha: 0.12), AppColors.brand.withValues(alpha: 0)],
                ),
              ),
              child: child,
            ),
          ),
        );
      },
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
          leading: Icon(icon, color: active ? AppColors.brand : Colors.white.withValues(alpha: 0.8)),
          title: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }
}
