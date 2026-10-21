import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../courier_providers.dart';
import 'duty_widgets.dart';

/// H08.8 a la vista: cuántos pasos esperan señal y, si la API rechazó uno al enviarlo más tarde, por qué.
class PendingStepsRibbon extends ConsumerWidget {
  const PendingStepsRibbon({super.key, this.orderCode});

  /// Solo los de este pedido (en la pantalla del pedido); null = todos.
  final String? orderCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final pending = ref.watch(pendingStepsProvider);
    final count = orderCode == null ? pending.steps.length : pending.of(orderCode!).length;
    final rejected = pending.rejected;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (rejected != null && (orderCode == null || rejected.step.orderCode == orderCode)) ...[
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
          decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(18)),
          child: Row(children: [
            const Icon(Icons.report_rounded, color: AppColors.chontaStrong),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                l10n.courierRejected(rejected.step.orderCode, errorText(l10n, rejected.error)),
                style: const TextStyle(color: AppColors.chontaStrong, fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(
              tooltip: l10n.close,
              onPressed: () => ref.read(pendingStepsProvider.notifier).dismissRejection(),
              icon: const Icon(Icons.close_rounded, color: AppColors.chontaStrong),
            ),
          ]),
        ),
        const SizedBox(height: 14),
      ],
      if (count > 0) ...[
        PendingRibbon(
          title: l10n.courierPending(count),
          body: l10n.courierPendingBody,
          sending: pending.sending,
          onRetry: () => ref.read(pendingStepsProvider.notifier).flush(),
        ),
        const SizedBox(height: 14),
      ],
    ]);
  }
}
