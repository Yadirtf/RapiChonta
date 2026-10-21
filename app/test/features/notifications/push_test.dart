
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/notifications/data/push_channel_resolver.dart';
import 'package:rapichonta/features/notifications/domain/push.dart';

/// Canal falso: entrega un token, falla o nunca responde (como FCM en un Huawei sin Google).
class _Channel implements PushChannel {
  _Channel(this.provider, {this.tokenValue, this.fails = false});

  @override
  final PushProvider provider;
  final String? tokenValue;
  final bool fails;
  int asked = 0;

  @override
  Future<String?> token() async {
    asked++;
    if (fails) throw StateError('SERVICE_NOT_AVAILABLE');
    return tokenValue;
  }

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();
  @override
  Future<PushTap?> initialTap() async => null;
  @override
  Stream<PushTap> get taps => const Stream.empty();
  @override
  Stream<PushNotice> get foreground => const Stream.empty();
  @override
  Future<PushPermission> permission() async => PushPermission.granted;
  @override
  Future<bool> requestPermission() async => true;
}

class _MemoryStorage implements FlutterSecureStorage {
  final values = <String, String>{};

  @override
  Future<String?> read({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async =>
      values[key];

  @override
  Future<void> write({required String key, required String? value, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    if (value != null) values[key] = value;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('Aviso tocado (H06.2: tocar la notificación abre el pedido)', () {
    test('FCM trae los datos tal cual; Huawei, como extras rc_* del intent', () {
      final fcm = PushTap.fromData({'type': 'ORDER_STATUS_CHANGED', 'notificationId': 'n-1', 'orderCode': 'RC-7K3M', 'status': 'ON_THE_WAY'})!;
      final hms = PushTap.fromData({'rc_type': 'ORDER_STATUS_CHANGED', 'rc_notificationId': 'n-1', 'rc_orderCode': 'RC-7K3M'})!;
      expect(fcm.route, '/pedidos/RC-7K3M');
      expect(hms.route, '/pedidos/RC-7K3M');
      expect(hms.notificationId, 'n-1');
    });

    test('los avisos del domiciliario abren su turno o su pedido en curso (E08)', () {
      expect(PushTap.fromData({'type': 'ORDER_OFFERED', 'orderCode': 'RC-7K3M'})!.route, '/turno');
      expect(PushTap.fromData({'type': 'OFFER_WITHDRAWN', 'orderCode': 'RC-7K3M'})!.route, '/turno');
      final prep = PushTap.fromData({'rc_type': 'PREPARATION_TIME_REACHED', 'rc_orderCode': 'RC-7K3M'})!;
      expect(prep.route, '/turno/pedido/RC-7K3M');
      expect(prep.forCourier, isTrue);
      expect(PushTap.fromData({'type': 'ORDER_STATUS_CHANGED', 'orderCode': 'RC-7K3M'})!.forCourier, isFalse);
    });

    test('sin pedido abre la bandeja de avisos; sin tipo no es un aviso nuestro', () {
      expect(PushTap.fromData({'type': 'INCIDENT_RESOLVED'})!.route, '/avisos');
      expect(PushTap.fromData({'orderCode': 'RC-7K3M'}), isNull);
      expect(PushTap.fromData(null), isNull);
    });
  });

  group('Elección del proveedor push (H06.1)', () {
    test('con Google usa FCM; en un Huawei sin Google cae a Push Kit y lo recuerda', () async {
      final storage = _MemoryStorage();
      final fcm = _Channel(PushProvider.fcm, fails: true);
      final hms = _Channel(PushProvider.hms, tokenValue: 'hms-token');
      final resolved = await PushChannelResolver(PushPreferences(storage), candidates: [fcm, hms]).resolve();
      expect(resolved?.channel.provider, PushProvider.hms);
      expect(resolved?.token, 'hms-token');
      expect(storage.values['rc.pushProvider'], 'HMS');

      // La próxima vez prueba Huawei primero: no espera a que FCM falle.
      final fcm2 = _Channel(PushProvider.fcm, fails: true);
      await PushChannelResolver(PushPreferences(storage), candidates: [fcm2, _Channel(PushProvider.hms, tokenValue: 'hms-token')]).resolve();
      expect(fcm2.asked, 0);
    });

    test('sin ningún servicio (web, emulador sin Google) no hay push y la app sigue', () async {
      final resolved = await PushChannelResolver(PushPreferences(_MemoryStorage()), candidates: [_Channel(PushProvider.fcm, tokenValue: null)]).resolve();
      expect(resolved, isNull);
      expect(await PushChannelResolver(PushPreferences(_MemoryStorage()), candidates: const []).resolve(), isNull);
    });
  });

  test('el aviso de la bandeja sabe a dónde lleva y se marca leído sin perder la fecha', () {
    final notice = AppNotification.fromJson({
      'id': 'n-9',
      'type': 'ORDER_STATUS_CHANGED',
      'orderCode': 'RC-7K3M',
      'status': 'ARRIVING',
      'storeName': 'Asadero La Chonta',
      'createdAt': '2026-10-21T20:07:00.000Z',
      'readAt': null,
    });
    expect(notice.unread, isTrue);
    expect(notice.tap.route, '/pedidos/RC-7K3M');
    final read = notice.markedRead(DateTime.utc(2026, 10, 21, 21));
    expect(read.unread, isFalse);
    expect(read.createdAt, notice.createdAt);
  });
}
