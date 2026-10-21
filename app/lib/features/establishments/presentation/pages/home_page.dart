import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../business/domain/business.dart';
import '../../../business/presentation/business_providers.dart';
import '../../../notifications/presentation/widgets/notification_bell.dart';
import '../../domain/entities/establishment.dart';
import '../format/money.dart';
import '../providers/establishments_providers.dart';
import '../widgets/cart_bar.dart';
import '../widgets/category_icon.dart';
import '../widgets/nearby_map.dart';
import '../widgets/side_menu.dart';
import '../widgets/storefront.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  static const _tabletBreakpoint = 840.0;

  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.sizeOf(context).width >= _tabletBreakpoint;
    final location = ref.watch(userLocationProvider);
    final nearby = ref.watch(nearbyEstablishmentsProvider);
    final l10n = AppLocalizations.of(context);

    final map = location.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => Center(child: Text(l10n.locationError)),
      data: (center) => NearbyMap(
        center: center,
        establishments: nearby.value ?? const [],
        selectedId: _selectedId,
        onSelect: _showDetail,
        coverage: ref.watch(coverageProvider).value ?? const [],
      ),
    );

    return Scaffold(
      drawer: isTablet ? null : const Drawer(child: SideMenu()),
      appBar: isTablet
          ? null
          : AppBar(
              title: const BrandLogo(size: 34, onDark: false),
              backgroundColor: AppColors.surface,
              actions: const [NotificationBell(), SizedBox(width: 4)],
            ),
      body: Row(
        children: [
          if (isTablet) const SideMenu(),
          Expanded(
            child: Stack(
              children: [
                map,
                const Positioned(top: 12, left: 16, right: 16, child: Center(child: _CoverageChip())),
                if (nearby.hasError)
                  Positioned(
                    top: 16,
                    left: 16,
                    right: 16,
                    child: Card(child: ListTile(title: Text(l10n.nearbyError))),
                  ),
                const Positioned(left: 0, right: 0, bottom: 0, child: CartBar()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showDetail(Establishment e) async {
    setState(() => _selectedId = e.id);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      clipBehavior: Clip.antiAlias,
      builder: (context) => _StoreSheet(establishment: e),
    );
    if (mounted) setState(() => _selectedId = null);
  }
}

/// Si llegamos a la ubicación del cliente (con la tarifa) o a cuánto queda la cobertura más cercana (H03.5).
/// Sin GPS no dice nada: el mapa ya muestra el área iluminada.
class _CoverageChip extends ConsumerWidget {
  const _CoverageChip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final check = ref.watch(deviceCoverageProvider).value;
    if (check == null) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final (inside, text) = switch (check) {
      CoverageInside(:final feeCents) => (true, l10n.coverageWeReachYou(formatPesos(feeCents, language))),
      CoverageOutside(:final distanceMeters?, :final municipalityName?) => (false, l10n.coverageAway(formatDistance(distanceMeters, language), municipalityName)),
      CoverageOutside() => (false, l10n.coverageNoneYet),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: inside ? AppColors.ink : AppColors.chontaStrong,
          borderRadius: BorderRadius.circular(99),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(color: inside ? AppColors.brand : Colors.white, shape: BoxShape.circle),
            child: Icon(inside ? Icons.delivery_dining_rounded : Icons.wrong_location_rounded, size: 14, color: inside ? AppColors.ink : AppColors.chontaStrong),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(text,
                maxLines: 2,
                textAlign: TextAlign.center,
                style: TextStyle(color: inside ? AppColors.brand : Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
          ),
        ]),
      ),
    );
  }
}

/// Ficha del local al tocar su pin: toldo, logo, categoría, distancia y la entrada a su menú.
class _StoreSheet extends ConsumerWidget {
  const _StoreSheet({required this.establishment});

  final Establishment establishment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = establishment;
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final category = ref.watch(categoriesProvider).value?.where((c) => c.code == e.category).firstOrNull?.name(language) ?? e.category;

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Awning(height: 18, stripe: 24, colorA: e.acceptsOrders ? AppColors.brand : const Color(0xFFBDBDBD), colorB: AppColors.cream),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(18)),
                      child: e.logoUrl == null
                          ? Icon(categoryIcon(e.categoryIcon), color: AppColors.brandStrong, size: 28)
                          : Image.network(e.logoUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(categoryIcon(e.categoryIcon))),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${category.toUpperCase()} · ${formatDistance(e.distanceMeters, language)}',
                              style: const TextStyle(color: AppColors.brandStrong, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 0.6)),
                          const SizedBox(height: 2),
                          Text(e.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, height: 1.1)),
                          Text(e.address, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black54)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    backgroundColor: e.acceptsOrders ? AppColors.ink : AppColors.surface,
                    foregroundColor: e.acceptsOrders ? AppColors.brand : Colors.black87,
                  ),
                  onPressed: () {
                    Navigator.of(context).pop();
                    context.push('/local/${e.id}');
                  },
                  icon: Icon(e.acceptsOrders ? Icons.storefront_rounded : Icons.menu_book_rounded),
                  label: Text(e.acceptsOrders ? l10n.orderHere : l10n.closedSeeMenu, style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 8),
                Center(child: Text(l10n.courierBuysForYou, style: const TextStyle(fontSize: 12, color: Colors.black45))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
