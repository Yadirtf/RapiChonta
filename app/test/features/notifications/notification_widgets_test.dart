import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/notifications/domain/push.dart';
import 'package:rapichonta/features/notifications/presentation/pages/notifications_page.dart';
import 'package:rapichonta/features/notifications/presentation/push_controller.dart';
import 'package:rapichonta/features/notifications/presentation/widgets/push_banner.dart';
import 'package:rapichonta/features/notifications/presentation/widgets/push_permission_sheet.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

class _Notices implements NotificationRepository {
  _Notices(this.items);

  final List<AppNotification> items;
  List<String>? markedIds;
  bool markedAll = false;

  @override
  Future<NotificationPage> page({String? before}) async => NotificationPage(items: items, unread: items.where((n) => n.unread).length);

  @override
  Future<int> unread() async => items.where((n) => n.unread).length;

  @override
  Future<int> markRead([List<String>? ids]) async {
    ids == null ? markedAll = true : markedIds = ids;
    return 0;
  }

  @override
  Future<void> registerToken(PushProvider provider, String token) async {}

  @override
  Future<void> removeToken() async {}
}

Widget _app(Widget home, NotificationRepository repository) => ProviderScope(
      overrides: [notificationRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        locale: const Locale('es'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: home,
      ),
    );

AppNotification _notice(String id, String status, {bool read = false, Duration ago = Duration.zero}) => AppNotification(
      id: id,
      type: 'ORDER_STATUS_CHANGED',
      orderCode: 'RC-7K3M',
      status: status,
      storeName: 'Asadero La Chonta',
      createdAt: DateTime.now().toUtc().subtract(ago),
      readAt: read ? DateTime.now().toUtc() : null,
    );

void main() {
  testWidgets('la bandeja agrupa por día, marca lo no leído y permite marcar todo', (tester) async {
    final repository = _Notices([_notice('n-2', 'ON_THE_WAY'), _notice('n-1', 'ACCEPTED', read: true, ago: const Duration(days: 3))]);
    await tester.pumpWidget(_app(const NotificationsPage(), repository));
    await tester.pumpAndSettle();
    expect(find.text('Avisos'), findsOneWidget);
    expect(find.text('Hoy'), findsOneWidget);
    expect(find.text('En camino'), findsOneWidget);
    expect(find.text('Tu pedido salió del local hacia tu dirección.'), findsOneWidget);
    expect(find.text('1 aviso sin leer'), findsOneWidget);
    expect(find.byType(NoticeSlip), findsNWidgets(2));
    await tester.tap(find.text('Leídos'));
    await tester.pumpAndSettle();
    expect(repository.markedAll, isTrue);
    expect(find.text('1 aviso sin leer'), findsNothing);
  });

  testWidgets('sin avisos explica cuándo llegan', (tester) async {
    await tester.pumpWidget(_app(const NotificationsPage(), _Notices([])));
    await tester.pumpAndSettle();
    expect(find.text('Todavía no hay avisos'), findsOneWidget);
  });

  testWidgets('el aviso con la app abierta baja, se toca para abrir y se va solo', (tester) async {
    var opened = 0;
    await tester.pumpWidget(_app(
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => PushBanner.show(
                Overlay.of(context),
                const PushNotice(
                  title: '¡Tu pedido va en camino!',
                  body: 'Salió de Asadero La Chonta hacia donde estás.',
                  tap: PushTap(type: 'ORDER_STATUS_CHANGED', orderCode: 'RC-7K3M', status: 'ON_THE_WAY'),
                ),
                onOpen: () => opened++,
              ),
              child: const Text('llega'),
            ),
          ),
        ),
      ),
      _Notices([]),
    ));
    await tester.tap(find.text('llega'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('¡Tu pedido va en camino!'), findsOneWidget);
    expect(find.text('RC-7K3M'), findsOneWidget);
    await tester.tap(find.text('¡Tu pedido va en camino!'));
    expect(opened, 1);
    await tester.pumpAndSettle();
    expect(find.text('¡Tu pedido va en camino!'), findsNothing);

    await tester.tap(find.text('llega'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('¡Tu pedido va en camino!'), findsOneWidget);
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    expect(find.text('¡Tu pedido va en camino!'), findsNothing);
  });

  testWidgets('antes del permiso del sistema la hoja muestra la ruta del pedido', (tester) async {
    bool? answer;
    await tester.pumpWidget(_app(
      Builder(
        builder: (context) => Scaffold(
          body: TextButton(onPressed: () async => answer = await PushPermissionSheet.show(context), child: const Text('pedir')),
        ),
      ),
      _Notices([]),
    ));
    await tester.tap(find.text('pedir'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('¿Te avisamos por el camino?'), findsOneWidget);
    expect(find.text('En el local'), findsOneWidget);
    await tester.tap(find.text('Sí, avísame'));
    await tester.pump(const Duration(seconds: 1));
    expect(answer, isTrue);
  });
}
