import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/sign_in.dart';
import 'error_text.dart';
import 'otp_field.dart';

/// Espera mínima antes de ofrecer reenviar (la API además limita a 3 envíos por hora).
const _resendAfter = Duration(seconds: 45);

/// Paso común a todos los ingresos y al cambio de número: escribir el código recibido.
class CodeStep extends StatefulWidget {
  const CodeStep({super.key, required this.sent, required this.onVerify, required this.onResend, this.onChangePhone});

  final SentCode sent;
  final Future<void> Function(String code) onVerify;
  final Future<SentCode> Function() onResend;
  final VoidCallback? onChangePhone;

  @override
  State<CodeStep> createState() => _CodeStepState();
}

class _CodeStepState extends State<CodeStep> {
  final _code = TextEditingController();
  late SentCode _sent = widget.sent;
  late DateTime _sentAt = DateTime.now();
  Timer? _ticker;
  Object? _error;
  bool _busy = false;
  bool _resending = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _code.dispose();
    super.dispose();
  }

  Duration get _expiresIn {
    final left = _sent.expiresAt.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  int get _resendIn => (_resendAfter - DateTime.now().difference(_sentAt)).inSeconds.clamp(0, 999);
  bool get _dead => _expiresIn == Duration.zero || (_error != null && isDeadCode(_error!));

  Future<void> _verify(String code) async {
    if (_busy || code.length != OtpField.length) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onVerify(code);
    } catch (error) {
      if (!mounted) return;
      _code.clear();
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      final sent = await widget.onResend();
      _code.clear();
      setState(() {
        _sent = sent;
        _sentAt = DateTime.now();
      });
    } catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  String _mmss(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18)),
          child: Row(
            children: [
              const Icon(Icons.sms_outlined, color: AppColors.brandStrong),
              const SizedBox(width: 12),
              Expanded(child: Text(l10n.codeSentTo(_sent.maskedPhone), style: const TextStyle(color: Colors.black87))),
              if (widget.onChangePhone != null) TextButton(onPressed: widget.onChangePhone, child: Text(l10n.change)),
            ],
          ),
        ),
        if (_sent.devCode case final dev?) ...[
          const SizedBox(height: 12),
          Material(
            color: AppColors.brand.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(14),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.science_outlined, color: AppColors.ink),
              title: Text('${l10n.devCode} $dev', style: const TextStyle(fontWeight: FontWeight.w700)),
              onTap: () => _code.text = dev,
            ),
          ),
        ],
        const SizedBox(height: 20),
        OtpField(controller: _code, onCompleted: _verify, enabled: !_busy && !_dead, hasError: _error != null, semanticsLabel: l10n.codeLabel),
        if (_error != null) ...[
          const SizedBox(height: 12),
          ErrorBanner(message: errorText(l10n, _error!)),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy || _dead || _code.text.length != OtpField.length ? null : () => _verify(_code.text),
          child: _busy ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(l10n.verify),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Text(
                _expiresIn > Duration.zero ? l10n.expiresIn(_mmss(_expiresIn)) : l10n.codeExpired,
                style: const TextStyle(color: Colors.black54, fontSize: 13),
              ),
            ),
            TextButton.icon(
              onPressed: _resendIn > 0 || _resending ? null : _resend,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text(_resendIn > 0 ? l10n.resendIn(_resendIn) : l10n.resend),
            ),
          ],
        ),
      ],
    );
  }
}

/// Mensaje de error en línea, legible y accesible (se anuncia al aparecer).
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: TextStyle(color: Colors.red.shade900))),
          ],
        ),
      ),
    );
  }
}
