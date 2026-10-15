import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/establishment.dart';
import '../providers/establishments_providers.dart';
import '../widgets/category_label.dart';
import '../widgets/nearby_map.dart';
import '../widgets/side_menu.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  static const _tabletBreakpoint = 840.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
        onSelect: (e) => _showDetail(context, e),
      ),
    );

    return Scaffold(
      drawer: isTablet ? null : const Drawer(child: SideMenu()),
      appBar: isTablet
          ? null
          : AppBar(
              title: Text(l10n.appTitle, style: const TextStyle(fontWeight: FontWeight.w800)),
              backgroundColor: AppColors.surface,
            ),
      body: Row(
        children: [
          if (isTablet) const SideMenu(),
          Expanded(
            child: Stack(
              children: [
                map,
                if (nearby.hasError)
                  Positioned(
                    top: 16,
                    left: 16,
                    right: 16,
                    child: Card(child: ListTile(title: Text(l10n.nearbyError))),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showDetail(BuildContext context, Establishment e) {
    final l10n = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(e.category.label(l10n).toUpperCase(),
                style: const TextStyle(color: AppColors.brandStrong, fontWeight: FontWeight.w700, fontSize: 12)),
            const SizedBox(height: 4),
            Text(e.name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            Text(e.address, style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 16),
            FilledButton(onPressed: () {}, child: Text(l10n.orderHere)),
            const SizedBox(height: 8),
            Center(
              child: Text(l10n.courierBuysForYou, style: const TextStyle(fontSize: 12, color: Colors.black45)),
            ),
          ],
        ),
      ),
    );
  }
}
