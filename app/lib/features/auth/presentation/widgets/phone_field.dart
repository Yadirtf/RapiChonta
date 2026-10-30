import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme.dart';

/// Solo los dígitos ("300 123 4567" → "3001234567").
String phoneDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

/// El celular se valida en la API; aquí solo se exige la forma de un móvil colombiano.
bool looksLikeMobile(String value) => RegExp(r'^3\d{9}$').hasMatch(phoneDigits(value));

/// "+573001234567" → "+57 300 123 4567".
String formatPhone(String? e164) {
  if (e164 == null) return '';
  final match = RegExp(r'^\+57(\d{3})(\d{3})(\d{4})$').firstMatch(e164);
  return match == null ? e164 : '+57 ${match[1]} ${match[2]} ${match[3]}';
}

/// Agrupa los dígitos como "300 123 4567" mientras se escribe.
class _ColombianMobileFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = phoneDigits(newValue.text);
    final clipped = digits.length > 10 ? digits.substring(0, 10) : digits;
    final buffer = StringBuffer();
    for (var i = 0; i < clipped.length; i++) {
      if (i == 3 || i == 6) buffer.write(' ');
      buffer.write(clipped[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

class PhoneField extends StatelessWidget {
  const PhoneField({super.key, required this.controller, required this.label, this.errorText, this.helperText, this.autofocus = false, this.focusNode, this.onSubmitted});

  final TextEditingController controller;
  final String label;
  final String? errorText;
  final String? helperText;
  final bool autofocus;
  final FocusNode? focusNode;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      focusNode: focusNode,
      keyboardType: TextInputType.phone,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [_ColombianMobileFormatter()],
      textInputAction: TextInputAction.next,
      onSubmitted: onSubmitted,
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 0.5),
      decoration: InputDecoration(
        labelText: label,
        hintText: '300 123 4567',
        errorText: errorText,
        helperText: helperText,
        helperMaxLines: 2,
        prefixIcon: const Padding(
          padding: EdgeInsets.only(left: 16, right: 8),
          child: Text('🇨🇴 +57', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.ink)),
        ),
        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
      ),
    );
  }
}
