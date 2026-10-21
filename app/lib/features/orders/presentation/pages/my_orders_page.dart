import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../domain/entities/order.dart';
import '../providers/orders_providers.dart';
import '../widgets/order_route.dart';
import '../widgets/order_visuals.dart';
import '../widgets/store_page.dart';

/// H04.4: Mis pedidos. Los que van en curso como tiquetes de comanda; el historial como recibos.
class MyOrdersPage extends ConsumerStatefulWidget {
  const MyOrdersPage({super.key});

  @override
  ConsumerState<MyOrdersPage> createState() => _MyOrdersPageState();
}

class _MyOrdersPageState extends ConsumerState<MyOrdersPage> {
  final _older = <OrderSummary>[];
  String? _cursor;
  bool _cursorSet = false;
  bool _loadingMore = false;

  Future<void> _more(String before) async {
    setState(() => _loadingMore = true);
    try {
      final page = await ref.read(orderRepositoryProvider).mine(before: before);
      setState(() {
        _older.addAll(page.past);
        _cursor = page.nextBefore;
        _cursorSet = true;
      });
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(AppLocalizations.of(context), error))));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final orders = ref.watch(myOrdersProvider);
    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.chonta,
        onRefresh: () async {
          setState(() {
            _older.clear();
            _cursorSet = false;
          });
          return ref.refresh(myOrdersProvider.future);
        },
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            StoreHeader(title: l10n.ordersTitle, backTo: '/', backLabel: l10n.ordersBackToMap),
            ...orders.when(
              loading: () => [const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))],
              error: (error, _) => [
                DoorCard(
                  icon: Icons.cloud_off_rounded,
                  title: l10n.ordersLoadError,
                  body: errorText(l10n, error),
                  action: OutlinedButton(onPressed: () => ref.invalidate(myOrdersProvider), child: Text(l10n.ordersRetry)),
                ),
              ],
              data: (page) => _content(context, page),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, OrderHistory page) {
    final l10n = AppLocalizations.of(context);
    final past = [...page.past, ..._older];
    final next = _cursorSet ? _cursor : page.nextBefore;
    if (page.active.isEmpty && past.isEmpty) {
      return [
        DoorCard(
          icon: Icons.delivery_dining_rounded,
          title: l10n.ordersEmptyTitle,
          body: l10n.ordersEmptyBody,
          action: FilledButton(onPressed: () => context.go('/'), child: Text(l10n.ordersToMap)),
        ),
      ];
    }
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (page.active.isNotEmpty) ...[
              _SectionTitle(icon: Icons.circle, iconColor: AppColors.brand, text: l10n.ordersActive),
              for (final order in page.active)
                Padding(padding: const EdgeInsets.only(bottom: 14), child: ActiveTicket(order: order, journey: page.journey)),
              const SizedBox(height: 18),
            ],
            _SectionTitle(icon: Icons.receipt_long_rounded, iconColor: AppColors.chonta, text: l10n.ordersHistory),
            if (past.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.ink.withValues(alpha: 0.1), width: 2)),
                child: Text(l10n.ordersEmptyHistory, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.55))),
              )
            else
              Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                clipBehavior: Clip.antiAlias,
                child: Column(children: [
                  for (var i = 0; i < past.length; i++) ...[
                    if (i > 0) Divider(height: 1, indent: 16, endIndent: 16, color: AppColors.ink.withValues(alpha: 0.08)),
                    _PastRow(order: past[i]),
                  ],
                ]),
              ),
            if (next != null)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: Center(
                  child: OutlinedButton(
                    onPressed: _loadingMore ? null : () => _more(next),
                    child: _loadingMore ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l10n.ordersMore),
                  ),
                ),
              ),
          ],
        ),
      ),
    ];
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.iconColor, required this.text});

  final IconData icon;
  final Color iconColor;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10, left: 2),
        child: Row(children: [
          Icon(icon, size: icon == Icons.circle ? 12 : 20, color: iconColor),
          const SizedBox(width: 8),
          Flexible(child: Semantics(header: true, child: Text(text, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)))),
        ]),
      );
}

/// Tiquete de un pedido en curso: la comanda desprendible con su código y la moto avanzando por la ruta.
class ActiveTicket extends StatelessWidget {
  const ActiveTicket({super.key, required this.order, required this.journey});

  final OrderSummary order;
  final List<String> journey;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final progress = OrderRules.progress(order.status, journey).clamp(0.04, 1.0);
    return ClipPath(
      clipper: const TicketClipper(notchAt: 0.64),
      child: Material(
        color: AppColors.ink,
        child: InkWell(
          onTap: () => context.push('/pedidos/${order.code}'),
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  StoreLogo(url: order.logoUrl, dark: true),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(order.establishmentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17)),
                      Text(orderDate(order.createdAt, language), style: const TextStyle(color: Colors.white54, fontSize: 12)),
                    ]),
                  ),
                  _Code(code: order.code),
                ]),
                const SizedBox(height: 14),
                StatusBadge(status: order.status),
                const SizedBox(height: 16),
                LayoutBuilder(
                  builder: (context, constraints) => SizedBox(
                    height: 28,
                    child: Stack(alignment: Alignment.centerLeft, children: [
                      Container(height: 8, decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(9))),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 700),
                        height: 8,
                        width: constraints.maxWidth * progress,
                        decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(9)),
                      ),
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 700),
                        left: (constraints.maxWidth * progress - 14).clamp(0, constraints.maxWidth - 28),
                        child: Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(color: AppColors.brand, shape: BoxShape.circle, border: Border.all(color: AppColors.ink, width: 4)),
                          child: const Icon(Icons.delivery_dining_rounded, size: 14, color: AppColors.ink),
                        ),
                      ),
                    ]),
                  ),
                ),
              ]),
            ),
            const _TearLine(),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 12, 14),
              child: Row(children: [
                Expanded(child: Text(l10n.ordersItems(order.itemCount), style: const TextStyle(color: Colors.white60))),
                Text(formatPesos(order.totalCents, language), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                const Icon(Icons.chevron_right_rounded, color: AppColors.brand),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Code extends StatelessWidget {
  const _Code({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(8)),
        child: Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w800, letterSpacing: 1)),
      );
}

/// Línea punteada del desprendible.
class _TearLine extends StatelessWidget {
  const _TearLine();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: LayoutBuilder(
          builder: (context, constraints) => Row(children: [
            for (var i = 0; i < constraints.maxWidth ~/ 10; i++) Container(width: 6, height: 2, margin: const EdgeInsets.only(right: 4), color: Colors.white24),
          ]),
        ),
      );
}

class _PastRow extends StatelessWidget {
  const _PastRow({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return InkWell(
      onTap: () => context.push('/pedidos/${order.code}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          StoreLogo(url: order.logoUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(order.establishmentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text('${orderDate(order.createdAt, language)} · ${l10n.ordersItems(order.itemCount)}',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatPesos(order.totalCents, language), style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            StatusBadge(status: order.status),
          ]),
        ]),
      ),
    );
  }
}
