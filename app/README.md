# RapiChonta App

App multiplataforma de RapiChonta con **Flutter (Dart)**: un solo código para Android, iOS, Huawei (AppGallery, sin Google Play Services) y web. Arquitectura limpia por *features* con **Riverpod** para estado e inyección de dependencias.

## Estructura

```
lib/
├── main.dart
├── app/                          # App, rutas (go_router) y tema
├── core/                         # Config por entorno, cliente HTTP, errores
└── features/
    └── establishments/
        ├── domain/               # Entidades, repositorios (interfaces) y casos de uso. Dart puro.
        ├── data/                 # Modelos/DTO, fuentes de datos remotas e implementación del repositorio
        └── presentation/         # Providers (Riverpod), páginas y widgets
```

Regla: `presentation → domain ← data`. El dominio no importa Flutter, Dio ni Riverpod.

## Primer arranque

Las carpetas de plataforma (`android/`, `ios/`, `web/`) no se versionan todavía: se generan una vez con el SDK instalado.

```bash
flutter create . --org com.rapichonta --project-name rapichonta --platforms=android,ios,web
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1   # emulador Android -> API local
```

Después de `flutter create`, agregar los permisos de ubicación:

- **Android** (`android/app/src/main/AndroidManifest.xml`): `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`.
- **iOS** (`ios/Runner/Info.plist`): `NSLocationWhenInUseUsageDescription`.

## Huawei

El mapa usa `flutter_map` con teselas de OpenStreetMap y la ubicación usa `geolocator`, que funciona con el `LocationManager` de Android cuando no hay Google Play Services. Así la misma APK se publica en Google Play y en Huawei AppGallery. Las notificaciones push en Huawei requieren Push Kit (HMS) y se agregan en la fase de notificaciones (ver `Docs/07-roadmap.md`).

## Pruebas

```bash
flutter analyze
flutter test
```
