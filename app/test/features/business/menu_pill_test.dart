import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/app/theme.dart';
import 'package:rapichonta/features/business/presentation/business_widgets.dart';

void main() {
  Future<void> pumpPills(WidgetTester tester, void Function(String) onTap) => tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            backgroundColor: AppColors.ink,
            body: Row(children: [
              MenuPill(label: 'COP', selected: true, onTap: () => onTap('COP')),
              MenuPill(label: '≈ USD', selected: false, onTap: () => onTap('USD')),
            ]),
          ),
        ),
      );

  Material pillOf(WidgetTester tester, String label) =>
      tester.widget<Material>(find.ancestor(of: find.text(label), matching: find.byType(Material)).first);

  testWidgets('en el menú oscuro la opción no elegida no tiene relleno y su texto es claro', (tester) async {
    final taps = <String>[];
    await pumpPills(tester, taps.add);

    expect(pillOf(tester, '≈ USD').color, Colors.transparent);
    expect(tester.widget<Text>(find.text('≈ USD')).style!.color!.computeLuminance(), greaterThan(0.7));
    expect(pillOf(tester, 'COP').color, Colors.white);
    expect(tester.widget<Text>(find.text('COP')).style!.color, AppColors.ink);

    await tester.tap(find.text('≈ USD'));
    await tester.tap(find.text('COP'));
    expect(taps, ['USD']);
  });
}
