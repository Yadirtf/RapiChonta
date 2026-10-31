import '../../../l10n/app_localizations.dart';
import '../../orders/presentation/widgets/order_visuals.dart';
import '../domain/push.dart';

/// Texto de un aviso en el idioma de la app. Los cambios de estado usan las mismas frases de la línea de
/// tiempo del pedido; los demás tipos (E07–E10) tienen la suya. Un tipo nuevo sin texto usa el genérico.
String noticeTitle(AppLocalizations l10n, AppNotification n) {
  if (n.type == 'ORDER_STATUS_CHANGED' && n.status != null) return statusLabel(l10n, n.status!);
  return switch (n.type) {
    'ORDER_OFFERED' => l10n.noticeOrderOffered,
    'OFFER_WITHDRAWN' => l10n.noticeOfferWithdrawn,
    'PREPARATION_TIME_REACHED' => l10n.noticePreparationReached,
    'ADJUSTMENT_REQUESTED' => l10n.noticeAdjustmentRequested,
    'ADJUSTMENT_RESOLVED' => l10n.noticeAdjustmentResolved,
    'TRIP_CANCELLED' => l10n.noticeTripCancelled,
    'INCIDENT_OPENED' => l10n.noticeIncidentOpened,
    'INCIDENT_RESOLVED' => l10n.noticeIncidentResolved,
    'DELIVERY_PROOF_PENDING' => l10n.noticeProofPending,
    'MERCHANT_ORDER_READY' => l10n.noticeMerchantOrderReady,
    _ => l10n.noticeGeneric,
  };
}

String? noticeBody(AppLocalizations l10n, AppNotification n) =>
    n.type == 'ORDER_STATUS_CHANGED' && n.status != null ? statusBody(l10n, n.status!) : null;
