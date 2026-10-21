import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../../core/config/env.dart';
import '../domain/push.dart';

/// FCM: Android con Google Play Services e iOS. Firebase se inicia con las opciones del --dart-define, así
/// el APK compila igual sin google-services.json y en un Huawei sin Google simplemente no entrega token.
class FcmPushChannel implements PushChannel {
  FirebaseMessaging? _messaging;

  @override
  PushProvider get provider => PushProvider.fcm;

  Future<FirebaseMessaging> _ready() async {
    if (_messaging != null) return _messaging!;
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: Env.firebaseApiKey,
          appId: defaultTargetPlatform == TargetPlatform.iOS ? Env.firebaseIosAppId : Env.firebaseAndroidAppId,
          messagingSenderId: Env.firebaseSenderId,
          projectId: Env.firebaseProjectId,
        ),
      );
    }
    return _messaging = FirebaseMessaging.instance;
  }

  @override
  Future<String?> token() async {
    final messaging = await _ready();
    // Sin Google Play Services falla con SERVICE_NOT_AVAILABLE (o nunca responde): el resolvedor prueba Huawei.
    // Se usa el token de registro (no el FID de register()): es el destino que la API envía por HTTP v1.
    // ignore: deprecated_member_use
    return messaging.getToken().timeout(const Duration(seconds: 8));
  }

  @override
  // ignore: deprecated_member_use
  Stream<String> get tokenRefreshes => FirebaseMessaging.instance.onTokenRefresh;

  @override
  Future<PushTap?> initialTap() async => PushTap.fromData((await (await _ready()).getInitialMessage())?.data);

  @override
  Stream<PushTap> get taps => FirebaseMessaging.onMessageOpenedApp.map((m) => PushTap.fromData(m.data)).where((t) => t != null).cast<PushTap>();

  @override
  Stream<PushNotice> get foreground => FirebaseMessaging.onMessage.expand((message) {
        final tap = PushTap.fromData(message.data);
        final notification = message.notification;
        if (tap == null || notification == null) return const <PushNotice>[];
        return [PushNotice(title: notification.title ?? '', body: notification.body ?? '', tap: tap)];
      });

  @override
  Future<PushPermission> permission() async => switch ((await (await _ready()).getNotificationSettings()).authorizationStatus) {
        AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushPermission.granted,
        AuthorizationStatus.denied || AuthorizationStatus.deniedPermanently => PushPermission.denied,
        AuthorizationStatus.notDetermined => PushPermission.notDetermined,
      };

  @override
  Future<bool> requestPermission() async {
    final settings = await (await _ready()).requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized || settings.authorizationStatus == AuthorizationStatus.provisional;
  }
}
