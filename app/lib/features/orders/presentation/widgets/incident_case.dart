import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/order.dart';
import 'order_visuals.dart';

/// H10.3: el caso de "No lo recibí" como un expediente de papel manila con su pestaña: qué está pasando, en qué
/// paso va (recibido, en revisión, cerrado) y cómo terminó. El cliente no queda esperando sin saber.
class IncidentCase extends StatelessWidget {
  const IncidentCase({super.key, required this.code, required this.incident});

  final String code;
  final OrderIncident incident;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final resolved = incident.status == 'RESOLVED';
    final taken = incident.reviewStartedAt != null || resolved;
    final (title, body) = switch ((resolved, incident.resolution)) {
      (true, 'RESOLVED_AS_DELIVERED') => (l10n.caseResolvedDeliveredTitle, l10n.caseResolvedDeliveredBody),
      (true, 'RESOLVED_AS_CANCELLED') => (l10n.caseResolvedCancelledTitle, l10n.caseResolvedCancelledBody),
      (true, _) => (l10n.caseResolvedTitle, l10n.caseResolvedBody),
      _ => (l10n.caseReviewTitle, taken ? l10n.caseReviewBodyTaken : l10n.caseReviewBody),
    };
    final steps = [
      (label: l10n.caseStepReported, at: incident.reportedAt, done: true),
      (label: l10n.caseStepReview, at: incident.reviewStartedAt, done: taken),
      (label: l10n.caseStepResolved, at: incident.resolvedAt, done: resolved),
    ];
    final current = resolved ? -1 : (taken ? 1 : 0);
    const manila = Color(0xFFF6E3B4);

    return Semantics(
      container: true,
      label: l10n.caseTab(code),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // La pestaña del expediente.
        Container(
          margin: const EdgeInsets.only(left: 18),
          padding: const EdgeInsets.fromLTRB(14, 7, 14, 6),
          decoration: const BoxDecoration(color: manila, borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
          child: Text(l10n.caseTab(code).toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.8, color: AppColors.chontaStrong)),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          decoration: BoxDecoration(
            color: manila,
            borderRadius: BorderRadius.circular(22),
            boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, 8))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: resolved ? AppColors.leaf : AppColors.chonta, borderRadius: BorderRadius.circular(13)),
                child: Icon(resolved ? Icons.task_alt_rounded : Icons.manage_search_rounded, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Semantics(liveRegion: true, child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: -0.3))),
                  const SizedBox(height: 4),
                  Text(body, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.72))),
                ]),
              ),
            ]),
            const SizedBox(height: 16),
            // La hoja dentro de la carpeta: los tres pasos del caso.
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(l10n.caseStepsLabel.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: AppColors.ink.withValues(alpha: 0.45))),
                const SizedBox(height: 8),
                for (final (i, step) in steps.indexed)
                  _Step(
                    label: step.label,
                    time: step.at == null ? (i == current ? l10n.caseNow : null) : orderTime(step.at!, language),
                    done: step.done,
                    current: i == current,
                    last: i == steps.length - 1,
                  ),
              ]),
            ),
            if (!resolved) ...[
              const SizedBox(height: 12),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.phone_in_talk_rounded, size: 18, color: AppColors.ink.withValues(alpha: 0.6)),
                const SizedBox(width: 8),
                Expanded(child: Text(l10n.caseContact, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.65)))),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.label, required this.time, required this.done, required this.current, required this.last});

  final String label;
  final String? time;
  final bool done;
  final bool current;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final dot = current ? AppColors.chonta : (done ? AppColors.ink : AppColors.ink.withValues(alpha: 0.15));
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 22,
          child: Column(children: [
            Container(
              width: 14,
              height: 14,
              margin: const EdgeInsets.only(top: 3),
              decoration: BoxDecoration(
                color: done || current ? dot : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: dot, width: 2.5),
                boxShadow: current ? [BoxShadow(color: AppColors.chonta.withValues(alpha: 0.35), blurRadius: 0, spreadRadius: 4)] : null,
              ),
            ),
            if (!last) Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 2), color: done ? AppColors.ink : AppColors.ink.withValues(alpha: 0.12))),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 12),
            child: Row(children: [
              Expanded(
                child: Text(label, style: TextStyle(fontWeight: current ? FontWeight.w900 : FontWeight.w700, color: done || current ? AppColors.ink : AppColors.ink.withValues(alpha: 0.4))),
              ),
              if (time != null) Text(time!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: current ? AppColors.chontaStrong : AppColors.ink.withValues(alpha: 0.5))),
            ]),
          ),
        ),
      ]),
    );
  }
}
