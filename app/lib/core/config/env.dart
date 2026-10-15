/// Configuración por entorno. Se inyecta al compilar:
/// flutter run --dart-define=API_URL=https://rapichonta-api.onrender.com/api/v1
class Env {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api/v1');
  static const mapTilesUrl = String.fromEnvironment(
    'MAP_TILES_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
}
