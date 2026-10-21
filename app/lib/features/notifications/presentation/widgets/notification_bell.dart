import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../push_controller.dart';

/// Campana de avisos con su contador en un sello de chontaduro. Solo con sesión.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key, this.onDark = false});

  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(sessionProvider).value == null) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    return IconButton(
      tooltip: unread > 0 ? l10n.noticesUnread(unread) : l10n.noticesTitle,
      onPressed: () => context.push('/avisos'),
      icon: Badge(
        isLabelVisible: unread > 0,
        backgroundColor: AppColors.chonta,
        textColor: Colors.white,
        label: Text(unread > 9 ? '9+' : '$unread', style: const TextStyle(fontWeight: FontWeight.w900)),
        child: Icon(unread > 0 ? Icons.notifications_active_rounded : Icons.notifications_none_rounded, color: onDark ? Colors.white : AppColors.ink),
      ),
    );
  }
}
