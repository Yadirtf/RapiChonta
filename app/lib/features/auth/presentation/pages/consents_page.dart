import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/auth_providers.dart';
import '../widgets/code_step.dart';
import '../widgets/consent_checklist.dart';
import '../widgets/error_text.dart';

/// Documentos legales pendientes (versión nueva, o rol nuevo como el de domiciliario): la app no sigue
/// hasta aceptarlos. La alternativa es cerrar sesión. El enrutador trae aquí a quien tenga pendientes.
class ConsentsPage extends ConsumerStatefulWidget {
  const ConsentsPage({super.key});

  @override
  ConsumerState<ConsentsPage> createState() => _ConsentsPageState();
}

class _ConsentsPageState extends ConsumerState<ConsentsPage> {
  Set<String> _accepted = {};
  Object? _error;
  bool _busy = false;

  Future<void> _accept() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final account = await ref.read(accountRepositoryProvider).acceptConsents(_accepted.toList());
      ref.read(sessionProvider.notifier).replace(account);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(sessionProvider).value;
    if (account == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final pending = account.pendingConsents;

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(18)),
                    child: const Icon(Icons.policy_outlined, color: AppColors.ink, size: 28),
                  ),
                  const SizedBox(height: 20),
                  Text(l10n.consentGateTitle(account.givenNames), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text(l10n.consentGateSubtitle, style: const TextStyle(color: Colors.black54, fontSize: 15)),
                  const SizedBox(height: 24),
                  ConsentChecklist(documents: pending, accepted: _accepted, onChanged: (s) => setState(() => _accepted = s)),
                  if (_error != null) ...[const SizedBox(height: 8), ErrorBanner(message: errorText(l10n, _error!))],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy || pending.any((d) => !_accepted.contains(d.id)) ? null : _accept,
                    child: _busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l10n.acceptAndContinue),
                  ),
                  const SizedBox(height: 8),
                  TextButton(onPressed: _busy ? null : () => ref.read(sessionProvider.notifier).signOut(), child: Text(l10n.signOutInstead)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
