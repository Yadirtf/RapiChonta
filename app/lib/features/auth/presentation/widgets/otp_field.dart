import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme.dart';

/// Código de 6 dígitos mostrado en casillas. Por debajo es un solo campo: funciona con el autocompletado
/// del SMS (Android/iOS) y con pegar el código completo.
class OtpField extends StatefulWidget {
  const OtpField({super.key, required this.controller, required this.onCompleted, this.enabled = true, this.hasError = false, required this.semanticsLabel});

  final TextEditingController controller;
  final ValueChanged<String> onCompleted;
  final bool enabled;
  final bool hasError;
  final String semanticsLabel;

  static const length = 6;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _focus.dispose();
    super.dispose();
  }

  void _changed() {
    setState(() {});
    if (widget.controller.text.length == OtpField.length) widget.onCompleted(widget.controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final text = widget.controller.text;
    return Semantics(
      label: widget.semanticsLabel,
      child: Stack(
        children: [
          Row(
            children: [
              for (var i = 0; i < OtpField.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: _Box(digit: i < text.length ? text[i] : '', active: _focus.hasFocus && i == text.length, error: widget.hasError)),
              ],
            ],
          ),
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                controller: widget.controller,
                focusNode: _focus,
                autofocus: true,
                enabled: widget.enabled,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: OtpField.length,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                showCursor: false,
                enableInteractiveSelection: false,
                decoration: const InputDecoration(counterText: '', border: InputBorder.none, filled: false),
                onTap: () => setState(() {}),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.digit, required this.active, required this.error});

  final String digit;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final border = error
        ? Colors.red.shade400
        : active
            ? AppColors.ink
            : digit.isEmpty
                ? AppColors.ink.withValues(alpha: 0.12)
                : AppColors.ink.withValues(alpha: 0.3);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      height: 58,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: error ? Colors.red.shade50 : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: active ? 2 : 1),
        boxShadow: active ? [BoxShadow(color: AppColors.brand.withValues(alpha: 0.35), blurRadius: 0, spreadRadius: 3)] : null,
      ),
      child: Text(digit, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink)),
    );
  }
}
