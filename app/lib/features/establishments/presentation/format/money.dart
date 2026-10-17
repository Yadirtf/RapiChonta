/// "$ 12.000" (español) o "$12,000" (inglés), como en Colombia. Sin `intl` para no depender de
/// datos de formato por país; los centavos solo se muestran cuando existen.
String formatPesos(int cents, String language) {
  final english = language == 'en';
  final whole = (cents ~/ 100).toString();
  final grouped = whole.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => english ? ',' : '.');
  final fraction = cents % 100 == 0 ? '' : '${english ? '.' : ','}${(cents % 100).toString().padLeft(2, '0')}';
  return english ? '\$$grouped$fraction' : '\$ $grouped$fraction';
}

String formatDistance(int meters, String language) {
  if (meters < 1000) return '${(meters / 10).round() * 10} m';
  final km = (meters / 1000).toStringAsFixed(1);
  return '${language == 'en' ? km : km.replaceAll('.', ',')} km';
}
