import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/core/error/failure.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';
import 'package:rapichonta/features/establishments/domain/repositories/establishment_repository.dart';
import 'package:rapichonta/features/establishments/presentation/pages/establishment_page.dart';
import 'package:rapichonta/features/establishments/presentation/providers/establishments_providers.dart';
import 'package:rapichonta/l10n/app_localizations.dart';

const _menu = EstablishmentDetail(
  id: 'e1',
  name: 'Frutería La Chonta',
  address: 'Carrera 4 # 6-10',
  acceptsOrders: true,
  location: GeoPoint(1.03, -76.61),
  categories: [EstablishmentCategoryTag(code: 'fruteria', icon: 'apple', primary: true)],
  sections: [
    MenuSection(id: 's1', name: 'Frutas', products: [
      MenuProduct(id: 'p1', versionId: 'v1', name: 'Chontaduro con sal y miel', description: 'Del día', priceCents: 850000, prepMinutes: 20, orderable: true),
      MenuProduct(id: 'p2', versionId: 'v1', name: 'Arazá', priceCents: 300000, prepMinutes: 0, orderable: false),
    ]),
  ],
);

class _Repository implements EstablishmentRepository {
  _Repository({this.missing = false});

  final bool missing;

  @override
  Future<List<Category>> categories() async => const [Category(code: 'fruteria', icon: 'apple', names: {'es': 'Frutería'})];

  @override
  Future<EstablishmentDetail> findById(String id, {required String language}) async =>
      missing ? throw const Failure('', code: 'ESTABLISHMENT_NOT_FOUND') : _menu;

  @override
  Future<List<Establishment>> findNearby({required GeoPoint origin, List<String> categories = const [], int radiusMeters = 3000}) async => const [];
}

Widget _app(EstablishmentRepository repository) => ProviderScope(
      overrides: [establishmentRepositoryProvider.overrideWithValue(repository)],
      child: const MaterialApp(
        locale: Locale('es'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: EstablishmentPage(id: 'e1'),
      ),
    );

void main() {
  testWidgets('muestra el menú y agrega a la canasta', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    await tester.pumpWidget(_app(_Repository()));
    await tester.pumpAndSettle();

    expect(find.text('Frutería La Chonta'), findsOneWidget);
    expect(find.text('FRUTERÍA'), findsOneWidget);
    expect(find.text(r'$ 8.500'), findsOneWidget);
    expect(find.text('AGOTADO'), findsWidgets);

    await tester.tap(find.byIcon(Icons.add_rounded).first);
    await tester.pumpAndSettle();
    expect(find.text('Ver canasta'), findsOneWidget);
    expect(find.text('1'), findsWidgets);
  });

  testWidgets('la búsqueda filtra y avisa si no hay coincidencias', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    await tester.pumpWidget(_app(_Repository()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'pizza');
    await tester.pumpAndSettle();
    expect(find.textContaining('pizza'), findsWidgets);
    expect(find.text('Chontaduro con sal y miel'), findsNothing);
  });

  testWidgets('un local que no existe muestra cómo volver al mapa', (tester) async {
    await tester.pumpWidget(_app(_Repository(missing: true)));
    await tester.pumpAndSettle();
    expect(find.text('No encontramos este local'), findsOneWidget);
    expect(find.text('Volver al mapa'), findsOneWidget);
  });
}
