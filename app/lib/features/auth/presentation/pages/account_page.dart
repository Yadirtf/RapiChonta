import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/account.dart';
import '../providers/auth_providers.dart';
import '../widgets/account_sheets.dart';
import '../widgets/code_step.dart';
import '../widgets/consent_checklist.dart';
import '../widgets/error_text.dart';
import '../widgets/phone_field.dart';

/// H01.5: Mi cuenta. El enrutador solo llega aquí con sesión.
class AccountPage extends ConsumerWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(sessionProvider).value;

    void notify(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));

    return Scaffold(
      appBar: AppBar(
        // Siempre hay salida: si se llegó al ingresar (sin pantalla debajo), vuelve al inicio, que en
        // modo domiciliario es el turno.
        leading: IconButton(
          tooltip: account?.activeRole == Role.courier ? l10n.tripBackToShift : MaterialLocalizations.of(context).backButtonTooltip,
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
          icon: const Icon(Icons.arrow_back_rounded, color: AppColors.ink),
        ),
        title: Text(l10n.menuMyAccount, style: const TextStyle(fontWeight: FontWeight.w800)),
        backgroundColor: AppColors.surface,
      ),
      body: account == null
          ? const Center(child: CircularProgressIndicator())
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 640),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  children: [
                    _Header(account: account),
                    if (account.canSwitchMode) ...[const SizedBox(height: 12), _ModeCard(account: account, onSwitched: notify)],
                    const SizedBox(height: 12),
                    _ProfileCard(account: account, onSaved: () => notify(l10n.profileSaved)),
                    const SizedBox(height: 12),
                    _Section(
                      icon: Icons.phone_outlined,
                      title: l10n.phoneLabel,
                      child: _Row(
                        title: formatPhone(account.phone),
                        subtitle: l10n.phoneChangeHint,
                        action: OutlinedButton(
                          onPressed: () async {
                            final changed = await showFormSheet<bool>(context, title: l10n.changePhoneTitle, subtitle: l10n.changePhoneSubtitle, child: const PhoneChangeForm());
                            if (changed == true) notify(l10n.phoneChanged);
                          },
                          child: Text(l10n.change),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const _LanguageCard(),
                    if (account.usesPassword) ...[
                      const SizedBox(height: 12),
                      _Section(
                        icon: Icons.key_outlined,
                        title: l10n.security,
                        child: _Row(
                          title: l10n.password,
                          subtitle: l10n.passwordHint,
                          action: OutlinedButton(
                            onPressed: () async {
                              final changed = await showFormSheet<bool>(context, title: l10n.changePasswordTitle, subtitle: l10n.changePasswordSubtitle, child: const PasswordForm());
                              if (changed == true) notify(l10n.passwordChanged);
                            },
                            child: Text(l10n.change),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    _Section(
                      icon: Icons.shield_outlined,
                      title: l10n.privacy,
                      child: Column(
                        children: [
                          for (final type in ['TERMS_OF_SERVICE', 'DATA_PROCESSING_POLICY', if (account.roles.contains(Role.courier)) 'COURIER_LOCATION_AUTHORIZATION'])
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.description_outlined, color: Colors.black45),
                              title: Text(legalTitle(l10n, type), style: const TextStyle(fontWeight: FontWeight.w500)),
                              trailing: const Icon(Icons.open_in_new_rounded, size: 18, color: Colors.black38),
                              onTap: () => openLegal(type),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.ink, foregroundColor: Colors.white),
                      onPressed: () async {
                        await ref.read(sessionProvider.notifier).signOut();
                        if (context.mounted) context.go('/');
                      },
                      icon: const Icon(Icons.logout_rounded),
                      label: Text(l10n.signOut),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      style: TextButton.styleFrom(foregroundColor: Colors.red.shade700, minimumSize: const Size.fromHeight(48)),
                      onPressed: () async {
                        final deleted = await showFormSheet<bool>(context, title: l10n.deleteTitle, subtitle: l10n.deleteSubtitle, child: const DeleteDataForm());
                        if (deleted != true || !context.mounted) return;
                        ref.read(sessionProvider.notifier).closed();
                        context.go('/');
                        notify(l10n.dataDeleted);
                      },
                      icon: const Icon(Icons.delete_outline_rounded),
                      label: Text(l10n.deleteData),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

String roleLabel(AppLocalizations l10n, Role role) => switch (role) {
      Role.customer => l10n.roleCustomer,
      Role.courier => l10n.roleCourier,
      Role.operator => l10n.roleOperator,
      Role.admin => l10n.roleAdmin,
    };

class _Header extends StatelessWidget {
  const _Header({required this.account});

  final Account account;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(28)),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(20)),
            child: Text(account.initials, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: AppColors.ink)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(account.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                Text(formatPhone(account.phone), style: const TextStyle(color: Colors.white60)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final role in account.roles)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: role == account.activeRole ? AppColors.brand : Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(roleLabel(l10n, role),
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: role == account.activeRole ? AppColors.ink : Colors.white70)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// RF-06: el domiciliario cambia a modo cliente para pedir para sí mismo (y vuelve).
class _ModeCard extends ConsumerStatefulWidget {
  const _ModeCard({required this.account, required this.onSwitched});

  final Account account;
  final ValueChanged<String> onSwitched;

  @override
  ConsumerState<_ModeCard> createState() => _ModeCardState();
}

class _ModeCardState extends ConsumerState<_ModeCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final courierMode = widget.account.activeRole == Role.courier;
    return _Section(
      icon: Icons.swap_horiz_rounded,
      title: l10n.modeTitle,
      child: _Row(
        title: courierMode ? l10n.modeCourierActive : l10n.modeCustomerActive,
        subtitle: courierMode ? l10n.modeCourierHint : l10n.modeCustomerHint,
        action: FilledButton.tonal(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: _busy
              ? null
              : () async {
                  setState(() => _busy = true);
                  try {
                    if (await switchMode(context, ref, widget.account)) {
                      widget.onSwitched(courierMode ? l10n.modeCustomerActive : l10n.modeCourierActive);
                      // Cada modo tiene su inicio: la pila anterior es del otro modo.
                      if (context.mounted) context.go(courierMode ? '/' : '/turno');
                    }
                  } catch (error) {
                    if (context.mounted) widget.onSwitched(errorText(l10n, error));
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          child: Text(courierMode ? l10n.switchToCustomer : l10n.switchToCourier),
        ),
      ),
    );
  }
}

class _ProfileCard extends ConsumerStatefulWidget {
  const _ProfileCard({required this.account, required this.onSaved});

  final Account account;
  final VoidCallback onSaved;

  @override
  ConsumerState<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends ConsumerState<_ProfileCard> {
  late final _given = TextEditingController(text: widget.account.givenNames);
  late final _family = TextEditingController(text: widget.account.familyNames ?? '');
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _given.dispose();
    _family.dispose();
    super.dispose();
  }

  bool get _dirty =>
      _given.text.trim() != widget.account.givenNames || (_family.text.trim().isEmpty ? null : _family.text.trim()) != widget.account.familyNames;

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final family = _family.text.trim();
      final account = await ref.read(accountRepositoryProvider).updateProfile(_given.text.trim(), family.isEmpty ? null : family);
      ref.read(sessionProvider.notifier).replace(account);
      widget.onSaved();
    } catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return _Section(
      icon: Icons.person_outline_rounded,
      title: l10n.personalData,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: _given, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: l10n.givenNames)),
          const SizedBox(height: 12),
          TextField(controller: _family, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: l10n.familyNames)),
          if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: errorText(l10n, _error!))],
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            child: _dirty
                ? Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => setState(() {
                            _given.text = widget.account.givenNames;
                            _family.text = widget.account.familyNames ?? '';
                          }),
                          child: Text(l10n.cancel),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size(120, 44)),
                          onPressed: _busy || _given.text.trim().isEmpty ? null : _save,
                          child: Text(l10n.save),
                        ),
                      ],
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}

class _LanguageCard extends ConsumerWidget {
  const _LanguageCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final current = Localizations.localeOf(context).languageCode;
    return _Section(
      icon: Icons.translate_rounded,
      title: l10n.language,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'es', label: Text('Español')), ButtonSegment(value: 'en', label: Text('English'))],
            selected: {current},
            showSelectedIcon: false,
            onSelectionChanged: (s) => ref.read(localeControllerProvider.notifier).choose(s.first),
          ),
          const SizedBox(height: 8),
          Text(l10n.languageHint, style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.child});

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.ink.withValues(alpha: 0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, size: 19, color: Colors.black54),
              ),
              const SizedBox(width: 12),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.title, required this.subtitle, required this.action});

  final String title;
  final String subtitle;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              const SizedBox(height: 2),
              Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ],
          ),
        ),
        const SizedBox(width: 12),
        action,
      ],
    );
  }
}
