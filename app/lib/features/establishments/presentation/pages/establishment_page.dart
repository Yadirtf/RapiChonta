import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../domain/entities/establishment.dart';
import '../providers/establishments_providers.dart';
import '../widgets/cart_bar.dart';
import '../widgets/category_icon.dart';
import '../widgets/product_card.dart';
import '../widgets/storefront.dart';

/// Página del local (H02.4): toldo, tablero con el nombre, aviso de puerta y el menú por secciones.
class EstablishmentPage extends ConsumerStatefulWidget {
  const EstablishmentPage({super.key, required this.id});

  final String id;

  @override
  ConsumerState<EstablishmentPage> createState() => _EstablishmentPageState();
}

class _EstablishmentPageState extends ConsumerState<EstablishmentPage> {
  final _sectionKeys = <String, GlobalKey>{};
  String _query = '';

  GlobalKey _keyFor(String sectionId) => _sectionKeys.putIfAbsent(sectionId, GlobalKey.new);

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final key = (widget.id, language);
    final l10n = AppLocalizations.of(context);

    // Cada vez que llega el menú, la canasta toma precios y disponibilidad vigentes.
    ref.listen(establishmentDetailProvider(key), (_, next) {
      final menu = next.value;
      if (menu == null) return;
      final changes = ref.read(cartProvider.notifier).reconcile(menu);
      if (changes == null || !context.mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      if (changes.removed.isNotEmpty) messenger.showSnackBar(SnackBar(content: Text(l10n.cartRemoved(changes.removed.join(', ')))));
      if (changes.repriced.isNotEmpty) messenger.showSnackBar(SnackBar(content: Text(l10n.cartRepriced(changes.repriced.join(', ')))));
    });

    final detail = ref.watch(establishmentDetailProvider(key));
    return Scaffold(
      backgroundColor: AppColors.surface,
      bottomNavigationBar: const CartBar(),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          notFound: error is Failure && error.code == 'ESTABLISHMENT_NOT_FOUND',
          message: errorText(l10n, error),
          onRetry: () => ref.invalidate(establishmentDetailProvider(key)),
        ),
        data: (menu) => _menu(context, menu),
      ),
    );
  }

  Widget _menu(BuildContext context, EstablishmentDetail menu) {
    final l10n = AppLocalizations.of(context);
    final cart = ref.watch(cartProvider);
    final query = _query.trim().toLowerCase();
    final sections = [
      for (final s in menu.sections)
        MenuSection(
          id: s.id,
          name: s.name,
          products: query.isEmpty ? s.products : s.products.where((p) => '${p.name} ${p.description ?? ''}'.toLowerCase().contains(query)).toList(),
        ),
    ].where((s) => s.products.isNotEmpty).toList();
    final placeholder = menu.primaryCategory?.icon ?? 'store';

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _Header(menu: menu)),
        if (menu.sections.isNotEmpty)
          SliverPersistentHeader(
            pinned: true,
            delegate: _SectionBar(
              sections: menu.sections,
              onSection: (id) {
                final target = _sectionKeys[id]?.currentContext;
                if (target != null) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 350), alignment: 0.02);
              },
              onSearch: (value) => setState(() => _query = value),
            ),
          ),
        if (menu.sections.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _Empty(icon: placeholder, text: l10n.storeEmptyMenu),
          )
        else if (sections.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _Empty(icon: 'search', text: l10n.noMatches(_query.trim())),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            sliver: SliverList.list(
              children: [
                for (final section in sections) ...[
                  Padding(
                    key: _keyFor(section.id),
                    padding: const EdgeInsets.fromLTRB(4, 20, 4, 12),
                    child: Row(
                      children: [
                        Text(section.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: CustomPaint(size: const Size.fromHeight(2), painter: _DashPainter()),
                        ),
                      ],
                    ),
                  ),
                  for (final product in section.products)
                    ProductCard(
                      product: product,
                      quantity: cart?.establishmentId == menu.id ? cart!.quantityOf(product.id) : 0,
                      canOrder: menu.acceptsOrders,
                      placeholderIcon: placeholder,
                      onAdd: () => _add(menu, product),
                      onQuantity: (q) => ref.read(cartProvider.notifier).setQuantity(product.id, q),
                    ),
                ],
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    l10n.storeCourierNote,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: Colors.black45),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _add(EstablishmentDetail menu, MenuProduct product) async {
    final cart = ref.read(cartProvider);
    if (cart != null && cart.belongsToOther(menu.id)) {
      final l10n = AppLocalizations.of(context);
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.shopping_basket_rounded, color: AppColors.brandStrong, size: 36),
          title: Text(l10n.cartSwitchTitle),
          content: Text(l10n.cartSwitchBody(cart.establishmentName, menu.name)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cartSwitchKeep)),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.cartSwitchConfirm)),
          ],
        ),
      );
      if (ok != true) return;
    }
    ref.read(cartProvider.notifier).add(menu, product);
  }
}

/// Toldo + tablero oscuro con el nombre del local, su categoría y el aviso de puerta.
class _Header extends ConsumerWidget {
  const _Header({required this.menu});

  final EstablishmentDetail menu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final primary = menu.primaryCategory;
    final categoryName = primary == null
        ? null
        : ref.watch(categoriesProvider).value?.where((c) => c.code == primary.code).firstOrNull?.name(language) ?? primary.code;
    final open = menu.acceptsOrders;

    return Column(
      children: [
        Container(
          color: AppColors.ink,
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 12, 0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconButton(
                        tooltip: l10n.backToMap,
                        color: Colors.white,
                        onPressed: () => context.canPop() ? context.pop() : context.go('/'),
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: DoorSign(
                          open: open,
                          title: open ? l10n.storeOpen : l10n.storeClosed,
                          subtitle: open ? l10n.storeOpenHint : l10n.storeClosedHint,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _Logo(url: menu.logoUrl, icon: primary?.icon ?? 'store'),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (categoryName != null) ...[
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.white24),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(categoryIcon(primary!.icon), size: 14, color: AppColors.brand),
                                    const SizedBox(width: 6),
                                    Text(
                                      categoryName.toUpperCase(),
                                      style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 8),
                            ],
                            Text(
                              menu.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                height: 1.05,
                                letterSpacing: -0.6,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.place_outlined, size: 14, color: Colors.white54),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    menu.address,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white60, fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Transform.translate(offset: const Offset(0, -1), child: const Awning(height: 22, stripe: 26)),
        if (!open)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.cream,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.brand),
              ),
              child: Row(
                children: [
                  const Icon(Icons.nightlight_round, color: AppColors.brandStrong),
                  const SizedBox(width: 10),
                  Expanded(child: Text(l10n.storeClosedBody, style: const TextStyle(fontSize: 13))),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo({required this.url, required this.icon});

  final String? url;
  final String icon;

  @override
  Widget build(BuildContext context) => Container(
    width: 64,
    height: 64,
    decoration: BoxDecoration(
      color: AppColors.cream,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: AppColors.brand, width: 3),
    ),
    clipBehavior: Clip.antiAlias,
    child: url == null
        ? Icon(categoryIcon(icon), color: AppColors.brandStrong, size: 30)
        : Image.network(
            url!,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Icon(categoryIcon(icon), color: AppColors.brandStrong),
          ),
  );
}

/// Barra fija con las secciones (saltan a cada una) y la búsqueda dentro del menú.
class _SectionBar extends SliverPersistentHeaderDelegate {
  _SectionBar({required this.sections, required this.onSection, required this.onSearch});

  final List<MenuSection> sections;
  final ValueChanged<String> onSection;
  final ValueChanged<String> onSearch;

  static const _height = 112.0;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final l10n = AppLocalizations.of(context);
    return Material(
      color: AppColors.surface,
      elevation: overlapsContent || shrinkOffset > 0 ? 2 : 0,
      shadowColor: AppColors.ink.withValues(alpha: 0.2),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: SizedBox(
              height: 44,
              child: TextField(
                onChanged: onSearch,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: l10n.searchMenu,
                  prefixIcon: const Icon(Icons.search_rounded),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: EdgeInsets.zero,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                ),
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
              itemCount: sections.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) => ActionChip(
                label: Text(sections[i].name, style: const TextStyle(fontWeight: FontWeight.w700)),
                backgroundColor: AppColors.cream,
                side: const BorderSide(color: AppColors.brand),
                shape: const StadiumBorder(),
                onPressed: () => onSection(sections[i].id),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_SectionBar old) => old.sections != sections;
}

class _DashPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.18)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    for (var x = 0.0; x < size.width; x += 10) {
      canvas.drawLine(Offset(x, 1), Offset(x + 4, 1), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text});

  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon == 'search' ? Icons.search_off_rounded : categoryIcon(icon), size: 48, color: Colors.black26),
        const SizedBox(height: 12),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.black54),
        ),
      ],
    ),
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.notFound, required this.message, required this.onRetry});

  final bool notFound;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        Container(
          color: AppColors.ink,
          child: const SafeArea(bottom: false, child: SizedBox(height: 12, width: double.infinity)),
        ),
        const Awning(height: 22, stripe: 26, colorA: Color(0xFFBDBDBD), colorB: Colors.white),
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(notFound ? Icons.no_meals_rounded : Icons.wifi_off_rounded, size: 56, color: Colors.black26),
                  const SizedBox(height: 16),
                  Text(
                    notFound ? l10n.storeNotFound : l10n.storeLoadError,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    notFound ? l10n.storeNotFoundBody : message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.black54),
                  ),
                  const SizedBox(height: 20),
                  if (!notFound) ...[FilledButton(onPressed: onRetry, child: Text(l10n.retry)), const SizedBox(height: 8)],
                  TextButton(onPressed: () => context.go('/'), child: Text(l10n.backToMap)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
