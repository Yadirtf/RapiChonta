import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../auth/presentation/widgets/phone_field.dart';
import '../../../business/presentation/business_widgets.dart';
import '../../../establishments/presentation/format/money.dart';
import '../../../establishments/presentation/providers/establishments_providers.dart';
import '../../../establishments/presentation/widgets/storefront.dart';
import '../../../notifications/presentation/push_controller.dart';
import '../../domain/entities/order.dart';
import '../providers/orders_providers.dart';
import '../widgets/delivery_pin_map.dart';
import '../widgets/order_route.dart';
import '../widgets/order_visuals.dart';
import '../widgets/store_page.dart';

/// H04.4 / RF-50: el pedido con su código, la ruta de estados y la comanda. Sin ubicación del domiciliario.
class OrderDetailPage extends ConsumerStatefulWidget {
  const OrderDetailPage({super.key, required this.code, this.placed = false});

  final String code;

  /// Recién confirmado: se celebra y se vacía la canasta de ese local.
  final bool placed;

  @override
  ConsumerState<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends ConsumerState<OrderDetailPage> {
  bool _celebrated = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final key = (widget.code, language);
    final order = ref.watch(orderDetailProvider(key));

    final loaded = order.value;
    if (loaded != null && widget.placed && !_celebrated) {
      _celebrated = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(cartProvider.notifier).placedAt(loaded.establishmentId);
        // Recién pedido es cuando más sentido tiene: "¿te avisamos por el camino?" (H06.2).
        final push = ref.read(pushControllerProvider);
        if (push.ready) {
          Future<void>.delayed(const Duration(milliseconds: 1200), () {
            if (context.mounted) push.maybeAskPermission(context);
          });
        }
      });
    }

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.chonta,
        onRefresh: () => ref.refresh(orderDetailProvider(key).future),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            StoreHeader(title: l10n.ordersDetailTitle, backTo: '/pedidos', backLabel: l10n.ordersToOrders),
            ...order.when(
              loading: () => [const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))],
              error: (error, _) => [
                error is Failure && (error.code == 'ORDER_NOT_FOUND' || error.code == 'NOT_FOUND')
                    ? DoorCard(
                        icon: Icons.manage_search_rounded,
                        title: l10n.ordersNotFoundTitle,
                        body: l10n.ordersNotFoundBody,
                        action: FilledButton(onPressed: () => context.go('/pedidos'), child: Text(l10n.ordersToOrders)),
                      )
                    : DoorCard(
                        icon: Icons.cloud_off_rounded,
                        title: l10n.ordersLoadError,
                        body: errorText(l10n, error),
                        action: OutlinedButton(onPressed: () => ref.invalidate(orderDetailProvider(key)), child: Text(l10n.ordersRetry)),
                      ),
              ],
              data: (order) => [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (widget.placed) _PlacedBanner(code: order.code),
                      _StatusTicket(order: order),
                      const SizedBox(height: 16),
                      _Card(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Text(l10n.ordersRoute, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 16),
                          OrderRoute(order: order),
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(16)),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              const Icon(Icons.verified_user_rounded, size: 18, color: AppColors.leaf),
                              const SizedBox(width: 8),
                              Expanded(child: Text(l10n.ordersPrivacy, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.65)))),
                            ]),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 16),
                      _Receipt(order: order),
                      const SizedBox(height: 16),
                      _DeliveryCard(order: order),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding = const EdgeInsets.all(18)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(26),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: child,
      );
}

/// El momento de "¡listo!": el tiquete con el código cae sobre la página.
class _PlacedBanner extends StatelessWidget {
  const _PlacedBanner({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 600),
      curve: Curves.elasticOut,
      builder: (context, t, child) => Transform.translate(offset: Offset(0, -20 * (1 - t)), child: Opacity(opacity: t.clamp(0, 1), child: child)),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(26)),
        child: Stack(children: [
          Positioned(right: -6, top: -6, child: Icon(Icons.celebration_rounded, size: 72, color: AppColors.chonta.withValues(alpha: 0.18))),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(liveRegion: true, child: Text(l10n.ordersPlacedTitle, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6))),
            const SizedBox(height: 4),
            Text(l10n.ordersPlacedBody, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.7), fontWeight: FontWeight.w500)),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(16)),
              child: Wrap(spacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(l10n.ordersCode.toUpperCase(), style: const TextStyle(color: Colors.white60, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.5)),
                Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 2)),
              ]),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _StatusTicket extends StatelessWidget {
  const _StatusTicket({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final body = statusBody(l10n, order.status);
    return ClipPath(
      clipper: const TicketClipper(notchAt: 0.72),
      child: Container(
        color: AppColors.ink,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                StoreLogo(url: order.logoUrl, dark: true),
                const SizedBox(width: 12),
                Expanded(
                  child: InkWell(
                    onTap: () => context.push('/local/${order.establishmentId}'),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(order.establishmentName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
                      Text(orderDate(order.createdAt, language), style: const TextStyle(color: Colors.white54, fontSize: 12)),
                    ]),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(8)),
                  child: Text(order.code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w800, letterSpacing: 1)),
                ),
              ]),
              const SizedBox(height: 16),
              StatusBadge(status: order.status, large: true),
              if (body != null) ...[const SizedBox(height: 10), Text(body, style: const TextStyle(color: Colors.white70, fontSize: 15))],
            ]),
          ),
          Container(height: 2, margin: const EdgeInsets.symmetric(horizontal: 14), color: Colors.white12),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
            child: Row(children: [
              if (order.active) ...[
                const Icon(Icons.circle, size: 8, color: AppColors.brand),
                const SizedBox(width: 6),
                Text(l10n.ordersUpdated, style: const TextStyle(color: Colors.white54, fontSize: 12)),
              ] else
                Text(l10n.ordersItems(order.itemCount), style: const TextStyle(color: Colors.white54, fontSize: 12)),
              const Spacer(),
              if (order.active && order.prepMinutes > 0)
                Flexible(
                  child: Text(l10n.ordersPrep(order.prepMinutes), textAlign: TextAlign.end, maxLines: 2, style: const TextStyle(color: Colors.white54, fontSize: 12)),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Receipt extends StatelessWidget {
  const _Receipt({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final muted = AppColors.ink.withValues(alpha: 0.6);
    return ClipPath(
      clipper: const ReceiptClipper(),
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.ordersReceipt.toUpperCase(), style: const TextStyle(color: AppColors.chonta, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
          const SizedBox(height: 8),
          for (final line in order.lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 32, child: Text('${line.quantity}×', style: const TextStyle(color: AppColors.chonta, fontWeight: FontWeight.w900))),
                  Expanded(child: Text(line.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text(formatPesos(line.subtotalCents, language), style: const TextStyle(fontWeight: FontWeight.w700)),
                ]),
                if (line.notes != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 32, top: 2),
                    child: Text(line.notes!, style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: muted)),
                  ),
              ]),
            ),
          Divider(height: 24, color: AppColors.ink.withValues(alpha: 0.12)),
          _Row(label: l10n.ordersProducts, value: formatPesos(order.itemsCents, language)),
          _Row(label: l10n.ordersDelivery(order.zoneName), value: formatPesos(order.feeCents, language)),
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(child: Text(l10n.ordersTotal, style: const TextStyle(fontWeight: FontWeight.w800))),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(formatPesos(order.totalCents, language), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.8)),
              ApproxPrice(cents: order.totalCents),
            ]),
          ]),
        ]),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6)))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      );
}

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final address = order.address;
    return _Card(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
          child: SizedBox(height: 150, child: DeliveryPinMap(center: address.location, interactive: false)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
          child: Column(children: [
            _InfoRow(
              icon: Icons.place_rounded,
              term: l10n.ordersDeliverTo,
              lines: [?address.label, ?address.reference, ?address.line],
            ),
            _InfoRow(
              icon: Icons.person_rounded,
              term: l10n.ordersReceivedBy,
              lines: order.recipient == null ? [l10n.ordersYou] : [order.recipient!.fullName, if (order.recipient!.phone != null) formatPhone(order.recipient!.phone)],
            ),
            _InfoRow(icon: paymentIcon(order.paymentMethod), term: l10n.ordersPayWith, lines: [paymentLabel(l10n, order.paymentMethod)]),
            if (order.notes != null) _InfoRow(icon: Icons.sticky_note_2_rounded, term: l10n.ordersNotes, lines: [order.notes!], last: true),
          ]),
        ),
      ]),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.term, required this.lines, this.last = false});

  final IconData icon;
  final String term;
  final List<String> lines;
  final bool last;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: AppColors.ink.withValues(alpha: 0.06)))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: AppColors.cream, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, size: 18, color: AppColors.chonta),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(term.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.ink.withValues(alpha: 0.45))),
              const SizedBox(height: 2),
              for (var i = 0; i < lines.length; i++)
                Text(lines[i], style: TextStyle(fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w500, color: i == 0 ? AppColors.ink : AppColors.ink.withValues(alpha: 0.7))),
            ]),
          ),
        ]),
      );
}
