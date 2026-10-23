import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/order.dart';
import 'countdown.dart';

typedef Preparation = ({DateTime estimatedReadyAt, bool delayed});

/// H09.1: la cuenta regresiva de preparación. Al cumplirse no se queda en 0:00: dice que ya casi sale o, si el
/// domiciliario avisó que sigue en preparación, que el local tiene mucha demanda.
class PrepCountdown extends StatelessWidget {
  const PrepCountdown({super.key, required this.preparation, this.dark = true});

  final Preparation preparation;

  /// Sobre el tiquete de tinta (amarillo) o sobre blanco (chontaduro).
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final color = dark ? AppColors.brand : AppColors.chontaStrong;
    return CountdownBuilder(
      until: preparation.estimatedReadyAt,
      builder: (context, left) {
        final due = left == Duration.zero;
        return Semantics(
          label: due ? null : l10n.ordersPrepLeftLabel(mmss(left)),
          child: ExcludeSemantics(
            excluding: !due,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(due ? Icons.local_fire_department_rounded : Icons.soup_kitchen_rounded, size: 15, color: color),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  due ? (preparation.delayed ? l10n.ordersPrepBusy : l10n.ordersPrepAlmost) : l10n.ordersPrepLeft(mmss(left)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w900, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ]),
          ),
        );
      },
    );
  }
}

/// La parada "Preparando" de la ruta: un fogón que se va llenando de la compra a la hora estimada, con la llama
/// en la punta. Si el local va atrasado, la barra queda llena y la llama se queda al final.
class PrepStove extends StatelessWidget {
  const PrepStove({super.key, required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final preparation = order.preparation;
    final since = order.timeline.lastWhere((t) => t.status == 'PREPARING', orElse: () => TimelineEntry('', order.statusAt)).at;
    if (preparation == null) return const SizedBox.shrink();
    final total = preparation.estimatedReadyAt.difference(since).inMilliseconds;
    return CountdownBuilder(
      until: preparation.estimatedReadyAt,
      builder: (context, left) {
        final done = total <= 0 ? 1.0 : (1 - left.inMilliseconds / total).clamp(0.04, 1.0);
        return Padding(
          padding: const EdgeInsets.only(top: 10, right: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              height: 24,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth;
                  return Stack(clipBehavior: Clip.none, alignment: Alignment.centerLeft, children: [
                    Container(height: 10, decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(99))),
                    AnimatedContainer(
                      duration: const Duration(seconds: 1),
                      height: 10,
                      width: width * done,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [AppColors.brand, AppColors.chonta]),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    AnimatedPositioned(
                      duration: const Duration(seconds: 1),
                      left: (width * done - 12).clamp(0, width - 24),
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: AppColors.ink,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: AppColors.chonta.withValues(alpha: 0.35), blurRadius: 8)],
                        ),
                        child: const Icon(Icons.local_fire_department_rounded, size: 14, color: AppColors.brand),
                      ),
                    ),
                  ]);
                },
              ),
            ),
            const SizedBox(height: 6),
            PrepCountdown(preparation: preparation, dark: false),
          ]),
        );
      },
    );
  }
}
