import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/establishments/presentation/format/money.dart';

void main() {
  test('pesos colombianos en español e inglés', () {
    expect(formatPesos(850000, 'es'), r'$ 8.500');
    expect(formatPesos(123456789, 'en'), r'$1,234,567.89');
    expect(formatPesos(0, 'es'), r'$ 0');
  });

  test('distancias', () {
    expect(formatDistance(234, 'es'), '230 m');
    expect(formatDistance(1500, 'es'), '1,5 km');
    expect(formatDistance(1500, 'en'), '1.5 km');
  });
}
