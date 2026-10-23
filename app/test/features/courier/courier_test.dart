import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rapichonta/core/error/failure.dart';
import 'package:rapichonta/features/courier/data/courier_repository_impl.dart';
import 'package:rapichonta/features/courier/data/location_tracker.dart';
import 'package:rapichonta/features/courier/data/pending_steps_store.dart';
import 'package:rapichonta/features/courier/domain/courier.dart';
import 'package:rapichonta/features/courier/domain/pending_steps.dart';
import 'package:rapichonta/features/courier/presentation/courier_providers.dart';
import 'package:rapichonta/features/courier/presentation/widgets/location_signal.dart';
import 'package:rapichonta/features/courier/presentation/widgets/receipt_capture.dart';
import 'package:rapichonta/features/establishments/domain/entities/establishment.dart';

import 'courier_fakes.dart';

void main() {
  group('Cola sin señal: reglas (H08.8)', () {
    final at = DateTime.utc(2026, 10, 21, 15);
    PendingStep step(StepKind kind, {String code = 'RC-7K3M'}) => PendingStep(id: '${kind.name}-$code', orderCode: code, kind: kind, occurredAt: at, amount: '38500', receiptPath: '/r.jpg');

    test('lo marcado sin señal se ve como hecho: compra → preparando, listo → en camino', () {
      expect(PendingRules.effectiveStatus('AT_ESTABLISHMENT', [step(StepKind.purchase)]), 'PREPARING');
      expect(PendingRules.effectiveStatus('AT_ESTABLISHMENT', [step(StepKind.purchase), step(StepKind.ready)]), 'ON_THE_WAY');
      expect(PendingRules.effectiveStatus('PREPARING', [step(StepKind.delay)]), 'PREPARING');
      // Un paso que ya no aplica (el servidor avanzó por otro lado) no mueve nada.
      expect(PendingRules.effectiveStatus('ON_THE_WAY', [step(StepKind.purchase)]), 'ON_THE_WAY');
      // "Llegué" y la entrega con foto sin señal.
      expect(PendingRules.effectiveStatus('ON_THE_WAY', [step(StepKind.arrived), step(StepKind.proof)]), 'PENDING_REVIEW');
    });

    test('sin respuesta o con el servidor caído se reintenta; un rechazo de la API no', () {
      expect(PendingRules.retryable(const Failure('', code: 'NETWORK_ERROR')), isTrue);
      expect(PendingRules.retryable(const Failure('', code: 'SERVER_ERROR')), isTrue);
      expect(PendingRules.retryable(const Failure('', code: 'TRIP_STEP_NOT_ALLOWED')), isFalse);
      expect(PendingRules.retryable(const Failure('', code: 'RECEIPT_INVALID')), isFalse);
    });

    test('un doble toque sin señal no encola dos compras; los retrasos sí se repiten', () {
      final pending = [step(StepKind.purchase)];
      expect(PendingRules.duplicate(pending, 'RC-7K3M', StepKind.purchase), isTrue);
      expect(PendingRules.duplicate(pending, 'RC-OTRO', StepKind.purchase), isFalse);
      expect(PendingRules.duplicate([step(StepKind.delay)], 'RC-7K3M', StepKind.delay), isFalse);
    });

    test('se guarda y se lee igual; una entrada dañada se descarta', () {
      final original = step(StepKind.purchase);
      final back = PendingStep.tryParse(original.toJson())!;
      expect(back.id, original.id);
      expect(back.kind, StepKind.purchase);
      expect(back.amount, '38500');
      expect(back.occurredAt, at);
      expect(PendingStep.tryParse({'id': 'x', 'orderCode': 'RC', 'kind': 'purchase', 'occurredAt': at.toIso8601String()}), isNull);
      expect(PendingStep.tryParse({'kind': 'teleport'}), isNull);
      expect(PendingStep.tryParse('basura'), isNull);
    });
  });

  group('Cobro en la puerta (H10.2)', () {
    const cash = CollectedPayment(paymentMethod: 'CASH', amountCents: 2000000);
    const nequi = CollectedPayment(paymentMethod: 'NEQUI', amountCents: 2150000);

    test('el efectivo siempre; los medios de cuenta solo si tiene la cuenta', () {
      expect(CollectionRules.methods(const []), ['CASH']);
      expect(CollectionRules.methods(const [nequiAccount, nequiAccount]), ['CASH', 'NEQUI']);
    });

    test('por qué no se puede registrar: sin pagos, montos en cero, medio repetido o demasiados', () {
      expect(CollectionRules.problem(const []), 'EMPTY');
      expect(CollectionRules.problem(const [CollectedPayment(paymentMethod: 'CASH', amountCents: 0)]), 'AMOUNT');
      expect(CollectionRules.problem(const [cash, cash]), 'REPEATED_METHOD');
      expect(
        CollectionRules.problem(const [cash, nequi, CollectedPayment(paymentMethod: 'DAVIPLATA', amountCents: 100), CollectedPayment(paymentMethod: 'BANK_TRANSFER', amountCents: 100)]),
        'TOO_MANY',
      );
      expect(CollectionRules.problem(const [cash, nequi]), isNull);
      expect(CollectionRules.total(const [cash, nequi]), 4150000);
    });

    test('los montos viajan en pesos decimales; el cobro en cola se guarda y se lee igual', () {
      expect(nequi.toJson(), {'paymentMethod': 'NEQUI', 'amount': '21500'});
      expect(const CollectedPayment(paymentMethod: 'CASH', amountCents: 150050).toJson()['amount'], '1500.50');
      final step = PendingStep(id: 'c-1', orderCode: 'RC-7K3M', kind: StepKind.collection, occurredAt: DateTime.utc(2026, 10, 21, 21), payments: const [cash, nequi]);
      expect(PendingStep.tryParse(step.toJson())!.payments, const [cash, nequi]);
      // Un cobro sin pagos no sirve: se descarta en vez de trabar la cola.
      expect(PendingStep.tryParse({...step.toJson(), 'payments': []}), isNull);
    });

    test('lo que llega de la API: el cobro del pedido y la cuenta con su QR', () {
      final trip = tripFromJson(tripJson(status: 'ARRIVING', collection: paidCollection));
      expect(trip.collection, const TripCollection(totalCents: 4150000, payments: [CollectedPayment(paymentMethod: 'NEQUI', amountCents: 4150000)]));
      expect(tripFromJson(tripJson(status: 'ARRIVING')).collection, isNull);
      final account = accountFromJson({
        'id': 'acc-1',
        'paymentMethod': 'NEQUI',
        'bank': null,
        'accountType': null,
        'accountNumber': '3101234567',
        'holderName': 'Jhon Jairo Criollo',
        'qrUrl': 'https://cdn.example/qr.png',
      });
      expect(account.qrUrl, 'https://cdn.example/qr.png');
    });
  });

  group('Lo que llega de la API', () {
    test('el pedido en curso: montos en centavos, geocerca y destino solo si la API lo revela', () {
      final trip = tripFromJson(tripJson(status: 'ACCEPTED'));
      expect(trip.itemsCents, 3850000);
      expect(trip.customerTotalCents, 4150000);
      expect(trip.storeArea, hasLength(4));
      expect(trip.destination, isNull);
      expect(trip.preparation, isNull);

      final onTheWay = tripFromJson(tripJson(status: 'ON_THE_WAY', revealed: true, prepared: true));
      expect(onTheWay.destination!.recipientName, 'Rosa Mutumbajoy');
      expect(onTheWay.destination!.location, const GeoPoint(1.031, -76.612));
      expect(onTheWay.preparation!.delayCount, 1);
      expect(onTheWay.purchase!.amountCents, 3900000);
    });

    test('la oferta y el estado del turno', () {
      final offer = offerFromJson(offerJson());
      expect(offer.itemCount, 3);
      expect(offer.feeCents, 300000);
      expect(offer.distanceMeters, 640);
      final status = statusFromJson({'verified': true, 'locationConsentPending': false, 'available': false, 'availableSince': null, 'activeOrder': {'code': 'RC-7K3M', 'status': 'PREPARING'}});
      expect(status.available, isFalse);
      expect(status.tracking, isTrue, reason: 'con pedido sigue reportando aunque no esté disponible');
      expect(status.locationFresh, isFalse, reason: 'una API anterior no lo manda: sin dato no se da por visto');
      final seen = statusFromJson({'verified': true, 'availableSince': '2026-10-21T15:00:00Z', 'lastLocationAt': '2026-10-21T15:01:00Z', 'locationFresh': true});
      expect(seen.lastLocationAt, DateTime.utc(2026, 10, 21, 15, 1));
      expect(seen.locationFresh, isTrue);
    });

    group('aviso cuando el panel no recibe la ubicación', () {
      final now = DateTime(2026, 10, 21, 15, 10);
      final unseen = CourierStatus(verified: true, locationConsentPending: false, availableSince: DateTime.utc(2026, 10, 21, 20));
      TrackerHealth health({int started = 300, int? fix, int? delivered, int? accepted}) {
        DateTime? ago(int? seconds) => seconds == null ? null : now.subtract(Duration(seconds: seconds));
        return TrackerHealth(startedAt: ago(started), lastFixAt: ago(fix), lastDeliveredAt: ago(delivered), lastAcceptedAt: ago(accepted));
      }

      test('si la API lo ve, o recién empezó el turno, no hay aviso', () {
        final seen = CourierStatus(verified: true, locationConsentPending: false, availableSince: DateTime.utc(2026, 10, 21, 20), locationFresh: true);
        expect(locationProblem(seen, health(), now), isNull);
        expect(locationProblem(unseen, health(started: 10), now), isNull);
        expect(locationProblem(const CourierStatus(verified: true, locationConsentPending: false, availableSince: null), health(), now), isNull);
      });

      test('dice en qué paso se quedó: GPS, envío o la API la descarta', () {
        expect(locationProblem(unseen, health(), now), LocationProblem.noFix);
        expect(locationProblem(unseen, health(fix: 200), now), LocationProblem.noFix);
        expect(locationProblem(unseen, health(fix: 3), now), LocationProblem.notDelivered);
        expect(locationProblem(unseen, health(fix: 3, delivered: 8), now), LocationProblem.rejected);
        expect(locationProblem(unseen, health(fix: 3, delivered: 8, accepted: 8), now), isNull, reason: 'ya llega: la API se pone al día');
      });
    });

    test('la lectura del GPS va en UTC y marca la ubicación simulada', () {
      final json = LocationReading(point: const GeoPoint(1.03, -76.61), recordedAt: DateTime.utc(2026, 10, 21, 15), accuracyM: 7.25, mocked: true).toJson();
      expect(json['recordedAt'], '2026-10-21T15:00:00.000Z');
      expect(json['accuracyM'], 7.3);
      expect(json['mocked'], isTrue);
    });

    test('un paso enviado tarde lleva la hora del teléfono; uno al instante, no', () {
      final at = DateTime.utc(2026, 10, 21, 15);
      expect(TripStepEvent(clientEventId: 'e', occurredAt: at, queued: false).toJson(), {'clientEventId': 'e'});
      expect(TripStepEvent(clientEventId: 'e', occurredAt: at, queued: true).toJson(), {'clientEventId': 'e', 'occurredAt': '2026-10-21T15:00:00.000Z', 'queued': true});
    });

    test('el tipo de la foto se reconoce por sus bytes', () {
      expect(sniffImageMime(jpeg), 'image/jpeg');
      expect(sniffImageMime(bytesOf([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'image/png');
      expect(sniffImageMime(bytesOf([0x47, 0x49, 0x46, 0x38])), isNull);
    });
  });

  group('Cola sin señal: envío (H08.8)', () {
    late FakeCourierRepository repository;
    late MemoryPendingStepsStore store;
    late ProviderContainer container;

    setUp(() {
      repository = FakeCourierRepository();
      store = MemoryPendingStepsStore();
      container = ProviderContainer(overrides: [
        courierRepositoryProvider.overrideWithValue(repository),
        pendingStepsStoreProvider.overrideWithValue(store),
      ]);
    });
    tearDown(() => container.dispose());

    PendingStepsController queue() => container.read(pendingStepsProvider.notifier);

    test('con señal sube la factura y registra la compra al instante', () async {
      final sent = await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.purchase, amount: '39000', receipt: ReceiptPhoto(bytes: jpeg, mimeType: 'image/jpeg'));
      expect(sent, isTrue);
      expect(repository.uploads, 1);
      expect(repository.steps.single, (kind: 'purchase', code: 'RC-7K3M', queued: false, receipt: 'file-1'));
      expect(container.read(pendingStepsProvider).steps, isEmpty);
      expect(await store.load(), isEmpty);
    });

    test('sin señal queda guardado; al volver sale en orden, sin subir otra vez la factura', () async {
      repository.offline = true;
      expect(await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.purchase, amount: '39000', receipt: ReceiptPhoto(bytes: jpeg, mimeType: 'image/jpeg')), isFalse);
      expect(await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.ready), isFalse);
      expect(container.read(pendingStepsProvider).steps.map((s) => s.kind), [StepKind.purchase, StepKind.ready]);
      expect((await store.load()).first.receiptFileId, isNull);

      repository.offline = false;
      await queue().flush();
      expect(repository.steps.map((s) => s.kind), ['purchase', 'ready']);
      expect(repository.uploads, 1);
      expect(container.read(pendingStepsProvider).steps, isEmpty);
    });

    test('la factura ya subida no se vuelve a subir si la compra falla por red', () async {
      repository.offlineSteps = true;
      await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.purchase, amount: '39000', receipt: ReceiptPhoto(bytes: jpeg, mimeType: 'image/jpeg'));
      expect((await store.load()).single.receiptFileId, 'file-1');
      repository.offlineSteps = false;
      await queue().flush();
      expect(repository.uploads, 1);
      expect(repository.steps.single.receipt, 'file-1');
    });

    test('si la API rechaza el paso, sale de la cola y quien lo marcó ve por qué', () async {
      repository.rejectNext = 'TRIP_STEP_NOT_ALLOWED';
      await expectLater(queue().submit(orderCode: 'RC-7K3M', kind: StepKind.ready), throwsA(isA<Failure>().having((f) => f.code, 'code', 'TRIP_STEP_NOT_ALLOWED')));
      expect(container.read(pendingStepsProvider).steps, isEmpty);
      expect(container.read(pendingStepsProvider).rejected, isNull);
    });

    test('el cobro sin señal espera en la cola y, al salir, queda cobrado en la pantalla', () async {
      const payments = [CollectedPayment(paymentMethod: 'CASH', amountCents: 4150000)];
      repository.offline = true;
      expect(await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.collection, payments: payments), isFalse);
      expect((await store.load()).single.payments, payments);
      repository.offline = false;
      await queue().flush();
      expect(repository.steps.single.kind, 'collection');
      expect(repository.collected.single, payments);
      expect(container.read(pendingStepsProvider).collected['RC-7K3M'], payments);
    });

    test('un rechazo al enviar más tarde queda a la vista hasta cerrarlo', () async {
      repository.offline = true;
      await queue().submit(orderCode: 'RC-7K3M', kind: StepKind.ready);
      repository
        ..offline = false
        ..rejectNext = 'TRIP_NOT_FOUND';
      await queue().flush();
      final state = container.read(pendingStepsProvider);
      expect(state.steps, isEmpty);
      expect(state.rejected!.error.code, 'TRIP_NOT_FOUND');
      queue().dismissRejection();
      expect(container.read(pendingStepsProvider).rejected, isNull);
    });
  });
}
