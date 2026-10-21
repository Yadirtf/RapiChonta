import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/push.dart';
import 'push_controller.dart';

/// La bandeja de avisos cargada: páginas por fecha y cuántos faltan por leer.
class NoticeBoard {
  const NoticeBoard({required this.items, required this.unread, this.nextBefore, this.loadingMore = false});

  final List<AppNotification> items;
  final int unread;
  final String? nextBefore;
  final bool loadingMore;

  NoticeBoard copyWith({List<AppNotification>? items, int? unread, String? Function()? nextBefore, bool? loadingMore}) => NoticeBoard(
        items: items ?? this.items,
        unread: unread ?? this.unread,
        nextBefore: nextBefore != null ? nextBefore() : this.nextBefore,
        loadingMore: loadingMore ?? this.loadingMore,
      );
}

class NoticesController extends AsyncNotifier<NoticeBoard> {
  NotificationRepository get _repository => ref.read(notificationRepositoryProvider);

  @override
  Future<NoticeBoard> build() async {
    final page = await ref.watch(notificationRepositoryProvider).page();
    return NoticeBoard(items: page.items, unread: page.unread, nextBefore: page.nextBefore);
  }

  Future<void> loadMore() async {
    final board = state.value;
    if (board == null || board.nextBefore == null || board.loadingMore) return;
    state = AsyncData(board.copyWith(loadingMore: true));
    try {
      final page = await _repository.page(before: board.nextBefore);
      state = AsyncData(board.copyWith(items: [...board.items, ...page.items], unread: page.unread, nextBefore: () => page.nextBefore, loadingMore: false));
    } catch (_) {
      state = AsyncData(board.copyWith(loadingMore: false));
      rethrow;
    }
  }

  /// Marca leído al instante en pantalla y luego en la API. Sin [id], todos.
  Future<void> markRead([String? id]) async {
    final board = state.value;
    if (board == null) return;
    final now = DateTime.now();
    final items = [for (final n in board.items) id == null || n.id == id ? n.markedRead(now) : n];
    final wasUnread = board.items.where((n) => n.unread && (id == null || n.id == id)).length;
    if (wasUnread == 0) return;
    state = AsyncData(board.copyWith(items: items, unread: (board.unread - wasUnread).clamp(0, board.unread)));
    try {
      final unread = await _repository.markRead(id == null ? null : [id]);
      if (state.value != null) state = AsyncData(state.value!.copyWith(unread: unread));
    } catch (_) {
      // Sin red: la próxima carga trae el estado real.
    }
    ref.invalidate(unreadNotificationsProvider);
  }
}

final noticesProvider = AsyncNotifierProvider.autoDispose<NoticesController, NoticeBoard>(NoticesController.new);
