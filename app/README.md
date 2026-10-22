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

## Idiomas

Los textos viven en `lib/l10n/app_es.arb` y `app_en.arb` (JSON). `flutter pub get` genera `AppLocalizations` (no se versiona); en un widget: `AppLocalizations.of(context).menuMyOrders`. La app usa el idioma del teléfono si es español o inglés; si no, español. Para agregar un idioma basta crear `app_<idioma>.arb`.

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

Ícono de Android: copiar `branding/android/res/` sobre `android/app/src/main/res/` (el workflow lo hace solo).

## APK de prueba (GitHub Actions)

El workflow `App Android` (`.github/workflows/app-android.yml`) compila un APK apuntando al entorno de prueba en Render (`https://rapichonta.onrender.com/api/v1`):

- En cada push a `develop` que toque `app/`, el APK queda en la pre-release **app-develop** (Releases del repositorio): se descarga e instala desde el teléfono.
- En cada PR que toque `app/`, el APK queda como artefacto del run (pestaña Actions → el run → Artifacts).
- A mano: Actions → App Android → Run workflow, con el campo `api_url` para apuntar a otra API. También se puede fijar la variable del repositorio `API_URL`.

El APK está firmado con la clave de debug: sirve para probar, no para publicar en tiendas.

## Huawei

El mapa usa `flutter_map` con teselas de OpenStreetMap y la ubicación usa `geolocator`, que funciona con el `LocationManager` de Android cuando no hay Google Play Services. Así la misma APK se publica en Google Play y en Huawei AppGallery. Las notificaciones push van por un canal intercambiable (`lib/features/notifications`): FCM en teléfonos con Google y Huawei Push Kit en los que no lo tienen. Firebase se configura con `--dart-define=FIREBASE_*` (sin `google-services.json`) y Huawei con `agconnect-services.json` y `--dart-define=HMS_PUSH_ENABLED=true`; ver "Notificaciones push" en `Docs/11-despliegue-snapdeploy.md` (aplica igual a Render). El ícono de la barra (`ic_stat_rapichonta`) lo genera `Docs/marca/generar_icono_aviso.py`.

## Pruebas

```bash
flutter analyze
flutter test
```
