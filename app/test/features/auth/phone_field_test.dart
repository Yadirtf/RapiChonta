import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/features/auth/presentation/widgets/phone_field.dart';

void main() {
  test('phoneDigits deja solo los dígitos', () {
    expect(phoneDigits('300 123-4567'), '3001234567');
  });

  test('looksLikeMobile acepta móviles colombianos de 10 dígitos', () {
    expect(looksLikeMobile('300 123 4567'), isTrue);
    expect(looksLikeMobile('6012345678'), isFalse);
    expect(looksLikeMobile('300123456'), isFalse);
  });

  test('formatPhone agrupa el número E.164', () {
    expect(formatPhone('+573001234567'), '+57 300 123 4567');
    expect(formatPhone(null), '');
    expect(formatPhone('+15551234567'), '+15551234567');
  });
}
