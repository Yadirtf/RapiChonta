/// Proveedor push del teléfono. El valor es el `code` de push_providers en la API.
enum PushProvider {
  /// Firebase Cloud Messaging: Android con Google Play Services e iOS.
  fcm('FCM'),

  /// Huawei Push Kit: teléfonos Huawei sin Google (HMS Core).
  hms('HMS');

  const PushProvider(this.apiValue);

  final String apiValue;

  static PushProvider? parse(String? value) => values.where((p) => p.apiValue == value).firstOrNull;
}

enum PushPermission { granted, denied, notDetermined }

/// Lo que trae un aviso para abrir lo que corresponde al tocarlo. FCM lo entrega en `data`; Huawei Push Kit,
/// como extras del intent con prefijo `rc_` (ver api/src/modules/notifications/infrastructure/push/hms-push.gateway.ts).
class PushTap {
  const PushTap({required this.type, this.notificationId, this.orderCode, this.status});

  final String type;
  final String? notificationId;
  final String? orderCode;
  final String? status;

  /// Lo que abre el aviso: las ofertas y el pedido en curso del domiciliario van al turno; los del cliente, a su
  /// pedido; sin pedido, la bandeja de avisos.
  String get route => switch (type) {
        'ORDER_OFFERED' || 'OFFER_WITHDRAWN' => '/turno',
        'PREPARATION_TIME_REACHED' when orderCode != null => '/turno/pedido/$orderCode',
        _ when orderCode != null => '/pedidos/$orderCode',
        _ => '/avisos',
      };

  /// Aviso del lado del domiciliario (refresca su turno, no los pedidos del cliente).
  bool get forCourier => const {'ORDER_OFFERED', 'OFFER_WITHDRAWN', 'PREPARATION_TIME_REACHED'}.contains(type);

  static PushTap? fromData(Map<dynamic, dynamic>? data) {
    if (data == null) return null;
    String? read(String key) {
      final value = data[key] ?? data['rc_$key'];
      return value is String && value.isNotEmpty ? value : null;
    }

    final type = read('type');
    if (type == null) return null;
    return PushTap(type: type, notificationId: read('notificationId'), orderCode: read('orderCode'), status: read('status'));
  }
}

/// Aviso que llega con la app abierta: el sistema no lo muestra, lo muestra la app (PushBanner).
class PushNotice {
  const PushNotice({required this.title, required this.body, required this.tap});

  final String title;
  final String body;
  final PushTap tap;
}

/// Puerto hacia el servicio push del teléfono. Un adaptador por proveedor (data/).
abstract interface class PushChannel {
  PushProvider get provider;

  /// Token del dispositivo, o null si el servicio no está disponible en este teléfono.
  Future<String?> token();

  /// El proveedor rota el token: hay que volver a registrarlo en la API.
  Stream<String> get tokenRefreshes;

  /// Aviso tocado que abrió la app desde cerrada.
  Future<PushTap?> initialTap();

  /// Aviso tocado con la app en segundo plano.
  Stream<PushTap> get taps;

  /// Aviso recibido con la app en primer plano.
  Stream<PushNotice> get foreground;

  Future<PushPermission> permission();

  /// Pide permiso al sistema (Android 13+ e iOS). Devuelve si quedó concedido.
  Future<bool> requestPermission();
}

/// Un aviso de la bandeja (GET /me/notifications). El texto lo pone la app con su idioma, por tipo y estado.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.createdAt,
    this.orderCode,
    this.status,
    this.storeName,
    this.readAt,
  });

  final String id;
  final String type;
  final String? orderCode;
  final String? status;
  final String? storeName;
  final DateTime createdAt;
  final DateTime? readAt;

  bool get unread => readAt == null;

  PushTap get tap => PushTap(type: type, notificationId: id, orderCode: orderCode, status: status);

  AppNotification markedRead(DateTime at) =>
      AppNotification(id: id, type: type, createdAt: createdAt, orderCode: orderCode, status: status, storeName: storeName, readAt: readAt ?? at);

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        orderCode: json['orderCode'] as String?,
        status: json['status'] as String?,
        storeName: json['storeName'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String),
      );
}

class NotificationPage {
  const NotificationPage({required this.items, required this.unread, this.nextBefore});

  final List<AppNotification> items;
  final int unread;
  final String? nextBefore;
}

abstract interface class NotificationRepository {
  Future<void> registerToken(PushProvider provider, String token);
  Future<void> removeToken();
  Future<NotificationPage> page({String? before});
  Future<int> unread();

  /// Sin [ids], marca todos. Devuelve cuántos quedan sin leer.
  Future<int> markRead([List<String>? ids]);
}
