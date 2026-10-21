import 'package:equatable/equatable.dart';

import '../../establishments/domain/entities/establishment.dart' show GeoPoint, parsePriceCents;

/// Estado de atención de RapiChonta en el municipio (H03.2). Las horas llegan en UTC.
class BusinessStatus extends Equatable {
  const BusinessStatus({required this.open, required this.timeZone, this.closesAt, this.nextOpeningAt});

  final bool open;
  final String timeZone;
  final DateTime? closesAt;
  final DateTime? nextOpeningAt;

  factory BusinessStatus.fromJson(Map<String, dynamic> json) => BusinessStatus(
        open: json['open'] == true,
        timeZone: (json['municipality'] as Map<String, dynamic>?)?['timeZone'] as String? ?? 'America/Bogota',
        closesAt: _date(json['closesAt']),
        nextOpeningAt: _date(json['nextOpeningAt']),
      );

  /// Próximo cambio (cierre o apertura): ahí se vuelve a pedir el estado.
  DateTime? get edge => open ? closesAt : nextOpeningAt;

  @override
  List<Object?> get props => [open, timeZone, closesAt, nextOpeningAt];
}

/// Pesos por unidad de USD o EUR (H03.4). `isToday` es falso si hoy no se pudo consultar la tasa.
class ExchangeRate extends Equatable {
  const ExchangeRate({required this.currency, required this.copPerUnit, required this.fetchedAt, required this.isToday});

  final String currency;
  final double copPerUnit;
  final DateTime fetchedAt;
  final bool isToday;

  factory ExchangeRate.fromJson(Map<String, dynamic> json) => ExchangeRate(
        currency: json['currency'] as String,
        copPerUnit: double.tryParse('${json['copPerUnit']}') ?? 0,
        fetchedAt: DateTime.parse(json['fetchedAt'] as String),
        isToday: json['isToday'] == true,
      );

  @override
  List<Object?> get props => [currency, copPerUnit, fetchedAt, isToday];
}

const displayCurrencies = ['USD', 'EUR'];

/// Hasta dónde llegan los domiciliarios en un municipio abierto (H03.5): polígonos con sus anillos
/// (el primero es el borde, los demás huecos). Llega como MultiPolygon GeoJSON, en [lng, lat].
class CoverageArea extends Equatable {
  const CoverageArea({required this.municipalityName, required this.center, required this.polygons});

  final String municipalityName;
  final GeoPoint center;
  final List<List<List<GeoPoint>>> polygons;

  factory CoverageArea.fromJson(Map<String, dynamic> json) {
    final municipality = json['municipality'] as Map<String, dynamic>;
    final center = municipality['center'] as Map<String, dynamic>;
    return CoverageArea(
      municipalityName: municipality['name'] as String,
      center: GeoPoint((center['lat'] as num).toDouble(), (center['lng'] as num).toDouble()),
      polygons: [
        for (final polygon in json['polygons'] as List)
          [
            for (final ring in polygon as List)
              [for (final p in ring as List) GeoPoint(((p as List)[1] as num).toDouble(), (p[0] as num).toDouble())],
          ],
      ],
    );
  }

  @override
  List<Object?> get props => [municipalityName, center, polygons];
}

/// Si un punto (GPS o pin) queda dentro de la cobertura, con la tarifa que pagaría; si no, a cuánto queda la más cercana.
sealed class CoverageCheck {
  const CoverageCheck();

  factory CoverageCheck.fromJson(Map<String, dynamic> json) {
    if (json['covered'] == true) {
      return CoverageInside(
        municipalityName: (json['municipality'] as Map<String, dynamic>)['name'] as String,
        feeCents: parsePriceCents('${json['fee']}') ?? 0,
      );
    }
    final nearest = json['nearest'] as Map<String, dynamic>?;
    return CoverageOutside(
      municipalityName: nearest?['municipalityName'] as String?,
      distanceMeters: (nearest?['distanceMeters'] as num?)?.round(),
    );
  }
}

class CoverageInside extends CoverageCheck {
  const CoverageInside({required this.municipalityName, required this.feeCents});
  final String municipalityName;
  final int feeCents;
}

/// `municipalityName` y `distanceMeters` son null si todavía no hay ningún municipio abierto.
class CoverageOutside extends CoverageCheck {
  const CoverageOutside({this.municipalityName, this.distanceMeters});
  final String? municipalityName;
  final int? distanceMeters;
}

DateTime? _date(Object? value) => value is String ? DateTime.parse(value) : null;

/// Hora del municipio. El MVP opera solo en Colombia, que no tiene horario de verano: UTC−5 todo el año.
/// Otro país necesitaría la base de zonas horarias (paquete `timezone`).
DateTime municipalTime(DateTime instant, String timeZone) {
  final offset = _fixedOffsets[timeZone] ?? const Duration(hours: -5);
  final utc = instant.toUtc().add(offset);
  return DateTime.utc(utc.year, utc.month, utc.day, utc.hour, utc.minute);
}

const _fixedOffsets = {'America/Bogota': Duration(hours: -5)};

/// "8:00 a. m." (español) o "8:00 AM" (inglés).
String formatClock(DateTime local, String language) {
  final hour12 = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minutes = local.minute.toString().padLeft(2, '0');
  final morning = local.hour < 12;
  return language == 'en' ? '$hour12:$minutes ${morning ? 'AM' : 'PM'}' : '$hour12:$minutes ${morning ? 'a. m.' : 'p. m.'}';
}

/// Cuándo vuelve a abrir, relativo a hoy en el municipio.
enum OpeningDay { today, tomorrow, later }

OpeningDay openingDay(DateTime nextOpeningLocal, DateTime nowLocal) {
  final today = DateTime.utc(nowLocal.year, nowLocal.month, nowLocal.day);
  final day = DateTime.utc(nextOpeningLocal.year, nextOpeningLocal.month, nextOpeningLocal.day);
  final diff = day.difference(today).inDays;
  return diff <= 0 ? OpeningDay.today : (diff == 1 ? OpeningDay.tomorrow : OpeningDay.later);
}

/// "≈ US$ 6,10" (español) o "≈ US$6.10" (inglés). Solo de referencia: se cobra en pesos.
String? approximatePrice(int cents, ExchangeRate? rate, String language) {
  if (rate == null || rate.copPerUnit <= 0) return null;
  final value = cents / 100 / rate.copPerUnit;
  final fixed = value.toStringAsFixed(2);
  final parts = fixed.split('.');
  final grouped = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => language == 'en' ? ',' : '.');
  final amount = language == 'en' ? '$grouped.${parts[1]}' : '$grouped,${parts[1]}';
  final symbol = rate.currency == 'USD' ? 'US\$' : '€';
  return language == 'en' ? '≈ $symbol$amount' : '≈ $symbol $amount';
}
