/// Configuración por entorno. Se inyecta al compilar:
/// flutter run --dart-define=API_URL=https://rapichonta.example.com/api/v1
class Env {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api/v1');
  static const mapTilesUrl = String.fromEnvironment(
    'MAP_TILES_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Sentry (H05.4): sin DSN la app no envía nada. Entorno: pruebas o produccion.
  static const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  static const sentryEnvironment = String.fromEnvironment('SENTRY_ENVIRONMENT', defaultValue: 'pruebas');

  /// Web pública (documentos legales). Por defecto, el mismo origen de la API (contenedor único).
  static const _webUrl = String.fromEnvironment('WEB_URL');
  static String get webUrl => _webUrl.isNotEmpty ? _webUrl : apiUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');

  /// Las URLs de archivos pueden venir relativas ("/api/v1/files/…", almacenamiento en la base de datos)
  /// o absolutas (R2/S3). Las relativas se resuelven contra el origen de la API.
  static String? resolveAsset(String? url) {
    if (url == null || url.isEmpty) return null;
    return url.startsWith('/') ? Uri.parse(apiUrl).resolve(url).toString() : url;
  }
}
