import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme.dart';
import '../../../l10n/app_localizations.dart';
import '../domain/business.dart';
import 'business_providers.dart';

/// Frase del horario: "Pide hasta las 10:00 p. m.", "Abrimos hoy a las 8:00 a. m.", "Abrimos el lunes…".
({bool open, String title, String detail}) openingText(AppLocalizations l10n, BusinessStatus status, String language) {
  String clock(DateTime instant) => formatClock(municipalTime(instant, status.timeZone), language);
  if (status.open) {
    return (open: true, title: l10n.businessOpen, detail: status.closesAt == null ? l10n.businessOpen : l10n.businessOpenUntil(clock(status.closesAt!)));
  }
  final next = status.nextOpeningAt;
  if (next == null) return (open: false, title: l10n.businessClosed, detail: l10n.businessNoSchedule);
  final local = municipalTime(next, status.timeZone);
  final time = clock(next);
  final detail = switch (openingDay(local, municipalTime(DateTime.now(), status.timeZone))) {
    OpeningDay.today => l10n.businessOpensToday(time),
    OpeningDay.tomorrow => l10n.businessOpensTomorrow(time),
    OpeningDay.later => l10n.businessOpensOn(_weekday(l10n, local.weekday), time),
  };
  return (open: false, title: l10n.businessClosed, detail: detail);
}

String _weekday(AppLocalizations l10n, int weekday) => switch (weekday) {
      DateTime.monday => l10n.weekdayMonday,
      DateTime.tuesday => l10n.weekdayTuesday,
      DateTime.wednesday => l10n.weekdayWednesday,
      DateTime.thursday => l10n.weekdayThursday,
      DateTime.friday => l10n.weekdayFriday,
      DateTime.saturday => l10n.weekdaySaturday,
      _ => l10n.weekdaySunday,
    };

/// Aviso de puerta "Abierto / Cerrado" con la hora de cierre o la próxima apertura (igual que la web).
class OpeningSign extends ConsumerWidget {
  const OpeningSign({super.key, this.dark = false});

  final bool dark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(businessStatusProvider).value;
    if (status == null) return const SizedBox.shrink();
    final text = openingText(AppLocalizations.of(context), status, Localizations.localeOf(context).languageCode);
    return Semantics(
      liveRegion: true,
      label: '${text.title}. ${text.detail}',
      child: ExcludeSemantics(
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                // chontaStrong: el blanco sobre chonta no llega a 4.5:1.
                color: text.open ? AppColors.leaf : AppColors.chontaStrong,
                borderRadius: BorderRadius.circular(8),
                boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.15), blurRadius: 4, offset: const Offset(0, 2))],
              ),
              child: Text(
                text.title.toUpperCase(),
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.4),
              ),
            ),
            const SizedBox(width: 10),
            Icon(Icons.schedule_rounded, size: 14, color: dark ? Colors.white.withValues(alpha: 0.78) : Colors.black54),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                text.detail,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: dark ? Colors.white.withValues(alpha: 0.78) : Colors.black54),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "≈ US$ 6,10" bajo un precio en pesos. Si la tasa no es de hoy, muestra su fecha.
class ApproxPrice extends ConsumerWidget {
  const ApproxPrice({super.key, required this.cents, this.color = Colors.black45, this.fontSize = 12});

  final int cents;
  final Color color;
  final double fontSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rate = ref.watch(selectedRateProvider);
    final language = Localizations.localeOf(context).languageCode;
    final text = approximatePrice(cents, rate, language);
    if (text == null || rate == null) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final date = '${rate.fetchedAt.toLocal().day}/${rate.fetchedAt.toLocal().month}';
    return Tooltip(
      message: rate.isToday ? l10n.approxNote : l10n.approxStale(date),
      child: Text(
        rate.isToday ? text : '$text ($date)',
        style: TextStyle(color: color, fontSize: fontSize, fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()]),
      ),
    );
  }
}

/// COP, ≈ USD o ≈ EUR (H03.4), para el menú lateral oscuro.
class CurrencyPicker extends ConsumerWidget {
  const CurrencyPicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(displayCurrencyProvider);
    final l10n = AppLocalizations.of(context);
    return Tooltip(
      message: l10n.currencyHint,
      child: Row(
        children: [
          for (final code in <String?>[null, ...displayCurrencies])
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: ChoiceChip(
                label: Text(code == null ? 'COP' : '≈ $code'),
                selected: selected == code,
                showCheckmark: false,
                labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: selected == code ? AppColors.ink : Colors.white.withValues(alpha: 0.82)),
                selectedColor: Colors.white,
                backgroundColor: Colors.transparent,
                side: BorderSide(color: selected == code ? Colors.white : Colors.white38),
                visualDensity: VisualDensity.compact,
                onSelected: (_) => ref.read(displayCurrencyProvider.notifier).choose(code),
              ),
            ),
        ],
      ),
    );
  }
}
