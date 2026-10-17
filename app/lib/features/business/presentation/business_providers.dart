import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/network/api_client.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/business_remote_datasource.dart';
import '../domain/business.dart';

final businessDataSourceProvider = Provider((ref) => BusinessRemoteDataSource(buildApiClient()));

/// Estado de atención. Se vuelve a pedir cada 2 minutos y justo cuando abre o cierra.
final businessStatusProvider = FutureProvider<BusinessStatus>((ref) async {
  final status = await ref.watch(businessDataSourceProvider).status();
  var wait = const Duration(minutes: 2);
  final edge = status.edge;
  if (edge != null) {
    final untilEdge = edge.difference(DateTime.now()) + const Duration(seconds: 1);
    if (untilEdge < wait) wait = untilEdge < const Duration(seconds: 5) ? const Duration(seconds: 5) : untilEdge;
  }
  final timer = Timer(wait, ref.invalidateSelf);
  ref.onDispose(timer.cancel);
  return status;
});

/// Tasas del día (o las últimas que hubo). Si fallan, simplemente no se muestra el aproximado.
final exchangeRatesProvider = FutureProvider<List<ExchangeRate>>((ref) => ref.watch(businessDataSourceProvider).exchangeRates());

/// Moneda del precio aproximado: null = solo pesos. Se guarda en el teléfono y, con sesión, en la cuenta.
class DisplayCurrencyController extends Notifier<String?> {
  static const _key = 'rc.displayCurrency';
  static const _storage = FlutterSecureStorage();

  @override
  String? build() {
    // Al entrar, manda la moneda guardada en la cuenta (se recuerda entre dispositivos).
    ref.listen(sessionProvider, (previous, next) {
      final account = next.value;
      if (account != null && previous?.value?.userId != account.userId) _adopt(account.displayCurrency);
    });
    _storage.read(key: _key).then((saved) {
      if (displayCurrencies.contains(saved)) state = saved;
    }, onError: (_) {});
    return null;
  }

  Future<void> _adopt(String? currency) async {
    state = currency;
    try {
      currency == null ? await _storage.delete(key: _key) : await _storage.write(key: _key, value: currency);
    } catch (_) {}
  }

  Future<void> choose(String? currency) async {
    state = currency;
    try {
      if (currency == null) {
        await _storage.delete(key: _key);
      } else {
        await _storage.write(key: _key, value: currency);
      }
    } catch (_) {
      // Sin almacenamiento seguro: queda en memoria.
    }
    if (ref.read(sessionProvider).value != null) {
      try {
        await ref.read(authedDioProvider).put<void>('/me/display-currency', data: {'currency': currency});
      } catch (_) {
        // La preferencia local ya aplica; la cuenta se actualiza la próxima vez.
      }
    }
  }
}

final displayCurrencyProvider = NotifierProvider<DisplayCurrencyController, String?>(DisplayCurrencyController.new);

/// Tasa de la moneda elegida, o null si el cliente prefiere solo pesos o no hay tasa.
final selectedRateProvider = Provider<ExchangeRate?>((ref) {
  final currency = ref.watch(displayCurrencyProvider);
  if (currency == null) return null;
  for (final rate in ref.watch(exchangeRatesProvider).value ?? const <ExchangeRate>[]) {
    if (rate.currency == currency) return rate;
  }
  return null;
});
