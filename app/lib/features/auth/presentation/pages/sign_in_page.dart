import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/account.dart';
import '../../domain/entities/sign_in.dart';
import '../providers/auth_providers.dart';
import '../widgets/code_step.dart';
import '../widgets/consent_checklist.dart';
import '../widgets/error_text.dart';
import '../widgets/phone_field.dart';

enum _Mode { customer, courier }

sealed class _Step {
  const _Step();
}

class _Credentials extends _Step {
  const _Credentials();
}

class _Code extends _Step {
  const _Code(this.sent);
  final SentCode sent;
}

class _Profile extends _Step {
  const _Profile(this.registration);
  final RegistrationRequired registration;
}

/// Ingreso (H01.1 y H01.3).
/// - Cliente: celular → código → (solo la primera vez) nombre y aceptación. Sin contraseña.
/// - Domiciliario: celular y contraseña → código.
class SignInPage extends ConsumerStatefulWidget {
  const SignInPage({super.key, this.next});

  /// A dónde volver al terminar.
  final String? next;

  @override
  ConsumerState<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends ConsumerState<SignInPage> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _givenNames = TextEditingController();
  final _familyNames = TextEditingController();
  _Mode _mode = _Mode.customer;
  _Step _step = const _Credentials();
  Set<String> _accepted = {};
  String? _phoneError;
  Object? _error;
  bool _busy = false;
  bool _showPassword = false;

  @override
  void dispose() {
    for (final c in [_phone, _password, _givenNames, _familyNames]) {
      c.dispose();
    }
    super.dispose();
  }

  String get _language => Localizations.localeOf(context).languageCode;

  Future<SentCode> _send() {
    final auth = ref.read(authRepositoryProvider);
    final phone = phoneDigits(_phone.text);
    return _mode == _Mode.customer ? auth.requestCode(phone, _language) : auth.startPasswordSignIn(phone, _password.text, _language);
  }

  Future<void> _submitCredentials() async {
    final l10n = AppLocalizations.of(context);
    if (!looksLikeMobile(_phone.text)) return setState(() => _phoneError = l10n.phoneInvalid);
    if (_mode == _Mode.courier && _password.text.isEmpty) return;
    await _run(() async {
      final sent = await _send();
      setState(() => _step = _Code(sent));
    });
  }

  Future<void> _verify(SentCode sent, String code) async {
    final auth = ref.read(authRepositoryProvider);
    if (_mode == _Mode.courier) return _done(await auth.completePasswordSignIn(sent.challengeId, code));
    switch (await auth.verifyCode(sent.challengeId, code)) {
      case SignedIn(:final account):
        await _done(account);
      case final RegistrationRequired registration:
        setState(() => _step = _Profile(registration));
    }
  }

  Future<void> _register(RegistrationRequired registration) => _run(() async {
        final account = await ref.read(authRepositoryProvider).register(
              registrationToken: registration.registrationToken,
              givenNames: _givenNames.text.trim(),
              familyNames: _familyNames.text.trim().isEmpty ? null : _familyNames.text.trim(),
              acceptedLegalVersionIds: _accepted.toList(),
              language: _language,
            );
        await _done(account);
      });

  Future<void> _done(Account account) async {
    await ref.read(sessionProvider.notifier).signedIn(account);
    if (!mounted) return;
    context.go(landingAfterSignIn(account, widget.next));
  }

  Future<void> _run(Future<void> Function() task) async {
    setState(() {
      _busy = true;
      _error = null;
      _phoneError = null;
    });
    try {
      await task();
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _back() => setState(() {
        _step = const _Credentials();
        _error = null;
      });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final (title, subtitle) = switch (_step) {
      _Credentials() when _mode == _Mode.courier => (l10n.courierSignInTitle, l10n.courierSignInSubtitle),
      _Credentials() => (l10n.signInTitle, l10n.signInSubtitle),
      _Code() => (l10n.codeTitle, null),
      _Profile() => (l10n.profileTitle, l10n.profileSubtitle),
    };

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        leading: _step is _Credentials ? const CloseButton() : BackButton(onPressed: _back),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(18)),
                  child: Icon(_mode == _Mode.courier ? Icons.delivery_dining_rounded : Icons.phone_iphone_rounded, color: AppColors.brand, size: 28),
                ),
                const SizedBox(height: 20),
                Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(subtitle, style: const TextStyle(color: Colors.black54, fontSize: 15)),
                ],
                const SizedBox(height: 28),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(animation), child: child),
                  ),
                  child: switch (_step) {
                    _Credentials() => _credentials(l10n),
                    _Code(:final sent) => CodeStep(
                        key: ValueKey(sent.challengeId),
                        sent: sent,
                        onVerify: (code) => _verify(sent, code),
                        onResend: _send,
                        onChangePhone: _back,
                      ),
                    _Profile(:final registration) => _profile(l10n, registration),
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _credentials(AppLocalizations l10n) {
    return AutofillGroup(
      key: const ValueKey('credentials'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<_Mode>(
            segments: [
              ButtonSegment(value: _Mode.customer, label: Text(l10n.modeCustomer), icon: const Icon(Icons.shopping_bag_outlined)),
              ButtonSegment(value: _Mode.courier, label: Text(l10n.modeCourier), icon: const Icon(Icons.delivery_dining_outlined)),
            ],
            selected: {_mode},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() {
              _mode = s.first;
              _error = null;
            }),
          ),
          const SizedBox(height: 20),
          PhoneField(
            controller: _phone,
            label: l10n.phoneLabel,
            errorText: _phoneError,
            helperText: _mode == _Mode.customer ? l10n.phoneHint : null,
            autofocus: true,
            onSubmitted: (_) => _mode == _Mode.customer ? _submitCredentials() : null,
          ),
          if (_mode == _Mode.courier) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _password,
              obscureText: !_showPassword,
              autofillHints: const [AutofillHints.password],
              onSubmitted: (_) => _submitCredentials(),
              decoration: InputDecoration(
                labelText: l10n.password,
                suffixIcon: IconButton(
                  tooltip: _showPassword ? l10n.hidePassword : l10n.showPassword,
                  icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                  onPressed: () => setState(() => _showPassword = !_showPassword),
                ),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            ErrorBanner(message: errorText(l10n, _error!)),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _submitCredentials,
            child: _busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(_mode == _Mode.customer ? l10n.sendCode : l10n.continueLabel),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.verified_user_outlined, size: 16, color: Colors.black45),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  _mode == _Mode.customer ? l10n.codeSingleUse : l10n.twoSteps,
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _profile(AppLocalizations l10n, RegistrationRequired registration) {
    final complete = _givenNames.text.trim().isNotEmpty && registration.requiredConsents.every((d) => _accepted.contains(d.id));
    return Column(
      key: const ValueKey('profile'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _givenNames,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.givenName],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: l10n.givenNames),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _familyNames,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.familyName],
          decoration: InputDecoration(labelText: l10n.familyNames, helperText: l10n.optional),
        ),
        const SizedBox(height: 18),
        ConsentChecklist(documents: registration.requiredConsents, accepted: _accepted, onChanged: (s) => setState(() => _accepted = s)),
        if (_error != null) ...[
          const SizedBox(height: 8),
          ErrorBanner(message: errorText(l10n, _error!)),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy || !complete ? null : () => _register(registration),
          child: _busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l10n.createAccount),
        ),
      ],
    );
  }
}
