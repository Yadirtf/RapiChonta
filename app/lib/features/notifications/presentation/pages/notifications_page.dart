import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../business/domain/business.dart';
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../../orders/presentation/widgets/store_page.dart';
import '../../domain/push.dart';
import '../notice_texts.dart';
import '../notices_controller.dart';
import '../widgets/chonta_glyph.dart';

/// E06: los avisos del cliente como papelitos de la tienda, por día. El talón lleva el color y el ícono del
/// estado; un chinche de chontaduro marca los que no ha leído. Tocar uno lo marca leído y abre el pedido.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final board = ref.watch(noticesProvider);
    final unread = board.value?.unread ?? 0;

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.chonta,
        onRefresh: () => ref.refresh(noticesProvider.future),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            StoreHeader(
              title: l10n.noticesTitle,
              backTo: '/',
              backLabel: l10n.ordersBackToMap,
              trailing: unread > 0
                  ? TextButton.icon(
                      onPressed: () => ref.read(noticesProvider.notifier).markRead(),
                      icon: const Icon(Icons.done_all_rounded, size: 18),
                      label: Text(l10n.noticesMarkAll),
                    )
                  : null,
            ),
            ...board.when(
              loading: () => [const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))],
              error: (error, _) => [
                DoorCard(
                  icon: Icons.cloud_off_rounded,
                  title: l10n.noticesLoadError,
                  body: errorText(l10n, error),
                  action: OutlinedButton(onPressed: () => ref.invalidate(noticesProvider), child: Text(l10n.ordersRetry)),
                ),
              ],
              data: (board) => board.items.isEmpty
                  ? [
                      DoorCard(
                        icon: Icons.notifications_none_rounded,
                        title: l10n.noticesEmptyTitle,
                        body: l10n.noticesEmptyBody,
                        action: FilledButton(onPressed: () => context.go('/pedidos'), child: Text(l10n.menuMyOrders)),
                      ),
                    ]
                  : [
                      if (unread > 0)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                          child: Text(l10n.noticesUnread(unread), style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w800)),
                        ),
                      for (final group in _byDay(board.items, language, l10n)) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                          child: Semantics(header: true, child: Text(group.label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900))),
                        ),
                        for (final notice in group.items)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                            child: NoticeSlip(
                              notice: notice,
                              onTap: () {
                                ref.read(noticesProvider.notifier).markRead(notice.id);
                                context.push(notice.tap.route);
                              },
                            ),
                          ),
                      ],
                      if (board.nextBefore != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                          child: OutlinedButton(
                            onPressed: board.loadingMore
                                ? null
                                : () => ref.read(noticesProvider.notifier).loadMore().catchError((Object error) {
                                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(l10n, error))));
                                    }),
                            child: board.loadingMore ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l10n.noticesMore),
                          ),
                        ),
                      const SizedBox(height: 32),
                    ],
            ),
          ],
        ),
      ),
    );
  }

  /// Hoy, Ayer o la fecha, en la hora del municipio (no la del teléfono).
  static List<({String label, List<AppNotification> items})> _byDay(List<AppNotification> items, String language, AppLocalizations l10n) {
    final today = municipalTime(DateTime.now(), orderTimeZone);
    final groups = <String, List<AppNotification>>{};
    for (final n in items) {
      final local = municipalTime(n.createdAt, orderTimeZone);
      final days = DateTime(today.year, today.month, today.day).difference(DateTime(local.year, local.month, local.day)).inDays;
      final label = days == 0 ? l10n.noticesToday : days == 1 ? l10n.noticesYesterday : orderDate(n.createdAt, language).split(' · ').first;
      (groups[label] ??= []).add(n);
    }
    return [for (final e in groups.entries) (label: e.key, items: e.value)];
  }
}

/// Papelito de aviso: talón de color con el ícono del estado, línea de corte y el texto. Sin leer, lleva el
/// chinche de chontaduro en la esquina y el papel un poco más cálido.
class NoticeSlip extends StatelessWidget {
  const NoticeSlip({super.key, required this.notice, required this.onTap});

  final AppNotification notice;
  final VoidCallback onTap;

  static const _stub = 64.0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final status = notice.status;
    final tone = toneColors(status == null ? StatusTone.progress : statusTone(status));
    final body = noticeBody(l10n, notice);
    final footer = [notice.storeName, orderTime(notice.createdAt, language)].whereType<String>().join(' · ');

    return Semantics(
      button: true,
      label: notice.unread ? l10n.noticesUnreadLabel : null,
      child: PhysicalShape(
        clipper: const _SlipClipper(stub: _stub),
        color: notice.unread ? Color.alphaBlend(AppColors.chontaSoft.withValues(alpha: 0.55), Colors.white) : Colors.white,
        elevation: notice.unread ? 3 : 1,
        shadowColor: AppColors.ink.withValues(alpha: 0.25),
        child: InkWell(
          onTap: onTap,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: _stub,
                  color: tone.background,
                  alignment: Alignment.center,
                  child: status == null ? ChontaGlyph(size: 26, color: tone.foreground) : Icon(statusIcon(status), color: tone.foreground, size: 26),
                ),
                const _Perforation(),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 14, 14, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(
                            child: Text(
                              noticeTitle(l10n, notice),
                              style: TextStyle(fontSize: 16, fontWeight: notice.unread ? FontWeight.w900 : FontWeight.w700, color: AppColors.ink),
                            ),
                          ),
                          if (notice.orderCode != null) _CodeTag(code: notice.orderCode!),
                          if (notice.unread) ...[const SizedBox(width: 8), const _Pin()],
                        ]),
                        if (body != null) ...[
                          const SizedBox(height: 4),
                          Text(body, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65), height: 1.3)),
                        ],
                        const SizedBox(height: 8),
                        Text(footer, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.5), fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CodeTag extends StatelessWidget {
  const _CodeTag({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(8)),
        child: Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 1)),
      );
}

/// Chinche de chontaduro: el aviso sigue sin leer.
class _Pin extends StatelessWidget {
  const _Pin();

  @override
  Widget build(BuildContext context) => Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(center: Alignment(-0.35, -0.35), colors: [Color(0xFFFF8A5B), AppColors.chonta, AppColors.chontaStrong], stops: [0, 0.55, 1]),
          boxShadow: [BoxShadow(color: AppColors.chontaStrong.withValues(alpha: 0.45), blurRadius: 4, offset: const Offset(0, 2))],
        ),
      );
}

/// Línea de corte entre el talón y el papel.
class _Perforation extends StatelessWidget {
  const _Perforation();

  @override
  Widget build(BuildContext context) => const SizedBox(width: 2, child: CustomPaint(painter: _DashPainter()));
}

class _DashPainter extends CustomPainter {
  const _DashPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = AppColors.ink.withValues(alpha: 0.12);
    for (double y = 0; y + 4 <= size.height; y += 8) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, 4), paint);
    }
  }

  @override
  bool shouldRepaint(_DashPainter oldDelegate) => false;
}

/// Papel con esquinas redondeadas y dos muescas (arriba y abajo) donde se desprende el talón.
class _SlipClipper extends CustomClipper<Path> {
  const _SlipClipper({required this.stub});

  final double stub;

  @override
  Path getClip(Size size) {
    final paper = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(18)));
    final notches = Path()
      ..addOval(Rect.fromCircle(center: Offset(stub + 1, 0), radius: 7))
      ..addOval(Rect.fromCircle(center: Offset(stub + 1, size.height), radius: 7));
    return Path.combine(PathOperation.difference, paper, notches);
  }

  @override
  bool shouldReclip(_SlipClipper old) => old.stub != stub;
}
