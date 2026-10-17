import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/business/domain/business.dart';

void main() {
  test('la hora del municipio es la de Colombia aunque el teléfono esté en otra zona', () {
    // 13:00 UTC = 8:00 a. m. en Bogotá.
    final local = municipalTime(DateTime.utc(2026, 10, 19, 13), 'America/Bogota');
    expect(formatClock(local, 'es'), '8:00 a. m.');
    expect(formatClock(local, 'en'), '8:00 AM');
    expect(formatClock(municipalTime(DateTime.utc(2026, 10, 20, 3, 30), 'America/Bogota'), 'es'), '10:30 p. m.');
    expect(formatClock(DateTime.utc(2026, 1, 1, 0, 5), 'en'), '12:05 AM');
  });

  test('próxima apertura: hoy, mañana o más adelante', () {
    final now = DateTime.utc(2026, 10, 19, 23);
    expect(openingDay(DateTime.utc(2026, 10, 19, 23, 30), now), OpeningDay.today);
    expect(openingDay(DateTime.utc(2026, 10, 20, 8), now), OpeningDay.tomorrow);
    expect(openingDay(DateTime.utc(2026, 10, 22, 8), now), OpeningDay.later);
  });

  test('precio aproximado en dólares y euros', () {
    final usd = ExchangeRate(currency: 'USD', copPerUnit: 4000, fetchedAt: DateTime.utc(2026, 10, 19), isToday: true);
    final eur = ExchangeRate(currency: 'EUR', copPerUnit: 4500, fetchedAt: DateTime.utc(2026, 10, 19), isToday: true);
    expect(approximatePrice(2440000, usd, 'es'), '≈ US\$ 6,10');
    expect(approximatePrice(2440000, usd, 'en'), '≈ US\$6.10');
    expect(approximatePrice(2340000000, eur, 'es'), '≈ € 5.200,00');
    expect(approximatePrice(1000, null, 'es'), isNull);
  });

  test('lee el estado y las tasas de la API', () {
    final status = BusinessStatus.fromJson({
      'open': false,
      'closesAt': null,
      'nextOpeningAt': '2026-10-20T13:00:00.000Z',
      'municipality': {'timeZone': 'America/Bogota'},
    });
    expect(status.open, isFalse);
    expect(status.edge, DateTime.utc(2026, 10, 20, 13));
    final rate = ExchangeRate.fromJson({'currency': 'USD', 'copPerUnit': '3912.4500', 'fetchedAt': '2026-10-19T11:00:00Z', 'isToday': false});
    expect(rate.copPerUnit, 3912.45);
    expect(rate.isToday, isFalse);
  });
}
