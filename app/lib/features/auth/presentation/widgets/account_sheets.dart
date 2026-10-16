import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/account.dart';
import '../../domain/entities/sign_in.dart';
import '../providers/auth_providers.dart';
import 'code_step.dart';
import 'error_text.dart';
import 'phone_field.dart';

/// Hoja inferior con el teclado en cuenta, del mismo estilo en todos los formularios de Mi cuenta.
Future<T?> showFormSheet<T>(BuildContext context, {required String title, String? subtitle, required Widget child}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (context) => Padding(
      padding: EdgeInsets.fromLTRB(24, 0, 24, 24 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            if (subtitle != null) ...[const SizedBox(height: 4), Text(subtitle, style: const TextStyle(color: Colors.black54))],
            const SizedBox(height: 20),
            child,
          ],
        ),
      ),
    ),
  );
}

Widget _progress() => const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5));

/// Cambio de celular: el número nuevo se confirma con un código enviado a ese número.
class PhoneChangeForm extends ConsumerStatefulWidget {
  const PhoneChangeForm({super.key});

  @override
  ConsumerState<PhoneChangeForm> createState() => _PhoneChangeFormState();
}

class _PhoneChangeFormState extends ConsumerState<PhoneChangeForm> {
  final _phone = TextEditingController();
  SentCode? _sent;
  Object? _error;
  String? _phoneError;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<SentCode> _send() => ref
      .read(accountRepositoryProvider)
      .requestPhoneChange(phoneDigits(_phone.text), Localizations.localeOf(context).languageCode);

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (!looksLikeMobile(_phone.text)) return setState(() => _phoneError = l10n.phoneInvalid);
    setState(() {
      _busy = true;
      _error = null;
      _phoneError = null;
    });
    try {
      final sent = await _send();
      setState(() => _sent = sent);
    } catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final sent = _sent;
    if (sent != null) {
      return CodeStep(
        sent: sent,
        onResend: _send,
        onChangePhone: () => setState(() => _sent = null),
        onVerify: (code) async {
          final account = await ref.read(accountRepositoryProvider).confirmPhoneChange(sent.challengeId, code);
          ref.read(sessionProvider.notifier).replace(account);
          if (context.mounted) Navigator.of(context).pop(true);
        },
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PhoneField(controller: _phone, label: l10n.newPhone, errorText: _phoneError, autofocus: true, onSubmitted: (_) => _submit()),
        if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: errorText(l10n, _error!))],
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy ? null : _submit, child: _busy ? _progress() : Text(l10n.sendCode)),
      ],
    );
  }
}

/// Política de contraseñas (la API la vuelve a verificar): 10 a 128 caracteres.
const passwordMin = 10;

class PasswordForm extends ConsumerStatefulWidget {
  const PasswordForm({super.key});

  @override
  ConsumerState<PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends ConsumerState<PasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_current, _next, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _valid => _current.text.isNotEmpty && _next.text.length >= passwordMin && _next.text == _confirm.text;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(accountRepositoryProvider).changePassword(_current.text, _next.text);
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mismatch = _confirm.text.isNotEmpty && _confirm.text != _next.text;
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: _current, obscureText: true, autofocus: true, autofillHints: const [AutofillHints.password], onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: l10n.currentPassword)),
          const SizedBox(height: 14),
          TextField(
            controller: _next,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: l10n.newPassword, helperText: l10n.passwordPolicy(passwordMin), helperMaxLines: 2),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _confirm,
            obscureText: true,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: l10n.confirmPassword, errorText: mismatch ? l10n.passwordMismatch : null),
          ),
          if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: errorText(l10n, _error!))],
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy || !_valid ? null : _submit, child: _busy ? _progress() : Text(l10n.savePassword)),
        ],
      ),
    );
  }
}

/// Eliminación de datos (Ley 1581 de 2012): se pide escribir una palabra para evitar toques accidentales.
class DeleteDataForm extends ConsumerStatefulWidget {
  const DeleteDataForm({super.key});

  @override
  ConsumerState<DeleteDataForm> createState() => _DeleteDataFormState();
}

class _DeleteDataFormState extends ConsumerState<DeleteDataForm> {
  final _typed = TextEditingController();
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(accountRepositoryProvider).deleteMyData();
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      setState(() {
        _error = error;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final word = l10n.deleteWord;
    final confirmed = _typed.text.trim().toUpperCase() == word.toUpperCase();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final line in [l10n.deleteConsequence1, l10n.deleteConsequence2, l10n.deleteConsequence3])
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(padding: EdgeInsets.only(top: 7, right: 10), child: Icon(Icons.circle, size: 6, color: Colors.black54)),
              Expanded(child: Text(line, style: const TextStyle(color: Colors.black87))),
            ]),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _typed,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: l10n.deleteConfirmLabel(word)),
        ),
        if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: errorText(l10n, _error!))],
        const SizedBox(height: 20),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600, foregroundColor: Colors.white),
          onPressed: _busy || !confirmed ? null : _submit,
          icon: const Icon(Icons.delete_forever_rounded),
          label: _busy ? _progress() : Text(l10n.deleteConfirm),
        ),
      ],
    );
  }
}

/// RF-06: volver a modo domiciliario pide la contraseña; pasar a modo cliente no.
Future<bool> switchMode(BuildContext context, WidgetRef ref, Account account) async {
  final target = account.activeRole == Role.courier ? Role.customer : Role.courier;
  if (!target.requiresPassword) {
    await ref.read(sessionProvider.notifier).switchRole(target);
    return true;
  }
  final l10n = AppLocalizations.of(context);
  final done = await showFormSheet<bool>(context, title: l10n.switchToCourierTitle, subtitle: l10n.switchToCourierSubtitle, child: _SwitchToCourierForm(target: target));
  return done ?? false;
}

class _SwitchToCourierForm extends ConsumerStatefulWidget {
  const _SwitchToCourierForm({required this.target});

  final Role target;

  @override
  ConsumerState<_SwitchToCourierForm> createState() => _SwitchToCourierFormState();
}

class _SwitchToCourierFormState extends ConsumerState<_SwitchToCourierForm> {
  final _password = TextEditingController();
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).switchRole(widget.target, password: _password.text);
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(controller: _password, obscureText: true, autofocus: true, onSubmitted: (_) => _submit(), onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: l10n.password)),
        if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: errorText(l10n, _error!))],
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy || _password.text.isEmpty ? null : _submit, child: _busy ? _progress() : Text(l10n.switchToCourierAction)),
      ],
    );
  }
}
