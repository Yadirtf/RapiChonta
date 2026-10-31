import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../business/domain/business.dart';
import '../../domain/entities/order.dart';

/// Ícono, tono y texto de cada estado del pedido (mismos que la web). Los estados vienen del catálogo de
/// la API: uno nuevo sin texto propio se muestra con su código y el ícono genérico.

enum StatusTone { attention, done, off, progress }

IconData statusIcon(String status) => switch (status) {
      'AWAITING_MERCHANT' => Icons.soup_kitchen_outlined,
      'PENDING_ASSIGNMENT' => Icons.search_rounded,
      'ACCEPTED' => Icons.how_to_reg_rounded,
      'AT_ESTABLISHMENT' => Icons.storefront_rounded,
      'AWAITING_CUSTOMER' => Icons.contact_support_rounded,
      'PREPARING' => Icons.soup_kitchen_rounded,
      'ON_THE_WAY' => Icons.delivery_dining_rounded,
      'ARRIVING' => Icons.where_to_vote_rounded,
      'PENDING_REVIEW' => Icons.photo_camera_rounded,
      'DISPUTED' => Icons.gpp_maybe_rounded,
      'DELIVERED' => Icons.inventory_2_rounded,
      'CANCELLED' => Icons.cancel_rounded,
      _ => Icons.help_outline_rounded,
    };

StatusTone statusTone(String status) => switch (status) {
      'AWAITING_CUSTOMER' || 'DISPUTED' || 'ARRIVING' => StatusTone.attention,
      'DELIVERED' => StatusTone.done,
      'CANCELLED' => StatusTone.off,
      _ => StatusTone.progress,
    };

({Color background, Color foreground}) toneColors(StatusTone tone) => switch (tone) {
      StatusTone.attention => (background: AppColors.chonta, foreground: Colors.white),
      StatusTone.done => (background: AppColors.leaf, foreground: Colors.white),
      StatusTone.off => (background: AppColors.ink.withValues(alpha: 0.1), foreground: AppColors.ink.withValues(alpha: 0.6)),
      StatusTone.progress => (background: AppColors.brand, foreground: AppColors.ink),
    };

/// En el pedido directo (E15) algunos hitos se cuentan distinto: el local prepara y el domiciliario recoge.
String statusLabel(AppLocalizations l10n, String status, {String? mode}) => switch ((status, mode)) {
      ('PENDING_ASSIGNMENT', directFulfillmentMode) => l10n.statusDirectPendingAssignmentLabel,
      ('AT_ESTABLISHMENT', directFulfillmentMode) => l10n.statusDirectAtEstablishmentLabel,
      _ => _statusLabel(l10n, status),
    };

String _statusLabel(AppLocalizations l10n, String status) => switch (status) {
      'AWAITING_MERCHANT' => l10n.statusAwaitingMerchantLabel,
      'PENDING_ASSIGNMENT' => l10n.statusPendingAssignmentLabel,
      'ACCEPTED' => l10n.statusAcceptedLabel,
      'AT_ESTABLISHMENT' => l10n.statusAtEstablishmentLabel,
      'AWAITING_CUSTOMER' => l10n.statusAwaitingCustomerLabel,
      'PREPARING' => l10n.statusPreparingLabel,
      'ON_THE_WAY' => l10n.statusOnTheWayLabel,
      'ARRIVING' => l10n.statusArrivingLabel,
      'PENDING_REVIEW' => l10n.statusPendingReviewLabel,
      'DISPUTED' => l10n.statusDisputedLabel,
      'DELIVERED' => l10n.statusDeliveredLabel,
      'CANCELLED' => l10n.statusCancelledLabel,
      _ => status,
    };

String? statusBody(AppLocalizations l10n, String status, {String? mode}) => switch ((status, mode)) {
      ('PENDING_ASSIGNMENT', directFulfillmentMode) => l10n.statusDirectPendingAssignmentBody,
      ('ACCEPTED', directFulfillmentMode) => l10n.statusDirectAcceptedBody,
      ('AT_ESTABLISHMENT', directFulfillmentMode) => l10n.statusDirectAtEstablishmentBody,
      _ => _statusBody(l10n, status),
    };

String? _statusBody(AppLocalizations l10n, String status) => switch (status) {
      'AWAITING_MERCHANT' => l10n.statusAwaitingMerchantBody,
      'PENDING_ASSIGNMENT' => l10n.statusPendingAssignmentBody,
      'ACCEPTED' => l10n.statusAcceptedBody,
      'AT_ESTABLISHMENT' => l10n.statusAtEstablishmentBody,
      'AWAITING_CUSTOMER' => l10n.statusAwaitingCustomerBody,
      'PREPARING' => l10n.statusPreparingBody,
      'ON_THE_WAY' => l10n.statusOnTheWayBody,
      'ARRIVING' => l10n.statusArrivingBody,
      'PENDING_REVIEW' => l10n.statusPendingReviewBody,
      'DISPUTED' => l10n.statusDisputedBody,
      'DELIVERED' => l10n.statusDeliveredBody,
      'CANCELLED' => l10n.statusCancelledBody,
      _ => null,
    };

IconData paymentIcon(String method) => switch (method) {
      'CASH' => Icons.payments_rounded,
      'NEQUI' || 'DAVIPLATA' => Icons.smartphone_rounded,
      'BANK_TRANSFER' => Icons.qr_code_2_rounded,
      _ => Icons.payments_rounded,
    };

/// La marca del medio en su ficha: la imagen que subió el panel sobre una etiqueta blanca, o el ícono del
/// medio si no hay imagen (o no carga).
class PaymentMark extends StatelessWidget {
  const PaymentMark({super.key, required this.option, this.selected = false});

  final PaymentOption option;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final icon = Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(color: selected ? AppColors.ink : AppColors.cream, borderRadius: BorderRadius.circular(14)),
      child: Icon(paymentIcon(option.code), color: selected ? AppColors.brand : AppColors.chonta, size: 20),
    );
    if (option.imageUrl == null) return icon;
    return Container(
      width: 40,
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: selected ? AppColors.ink : AppColors.ink.withValues(alpha: 0.1), width: 2),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(option.imageUrl!, fit: BoxFit.contain, errorBuilder: (_, _, _) => Icon(paymentIcon(option.code), color: AppColors.chonta, size: 20)),
      ),
    );
  }
}

String paymentLabel(AppLocalizations l10n, String method) => switch (method) {
      'CASH' => l10n.payCash,
      'NEQUI' => l10n.payNequi,
      'DAVIPLATA' => l10n.payDaviplata,
      'BANK_TRANSFER' => l10n.payBankTransfer,
      _ => method,
    };

/// Por qué se canceló (código de cancellation_reasons). Uno nuevo sin texto se dice de forma general.
String cancelReasonText(AppLocalizations l10n, String reason) => switch (reason) {
      'CUSTOMER_REQUEST' => l10n.cancelReasonCustomerRequest,
      'NO_COURIER_AVAILABLE' => l10n.cancelReasonNoCourier,
      'MERCHANT_OUT_OF_STOCK' => l10n.cancelReasonMerchantOutOfStock,
      'MERCHANT_TOO_BUSY' => l10n.cancelReasonMerchantTooBusy,
      'MERCHANT_CLOSING' => l10n.cancelReasonMerchantClosing,
      'ESTABLISHMENT_CLOSED' => l10n.cancelReasonStoreClosed,
      'ALL_ITEMS_UNAVAILABLE' => l10n.cancelReasonAllUnavailable,
      'CUSTOMER_UNREACHABLE' => l10n.cancelReasonUnreachable,
      'INCIDENT_RESOLUTION' => l10n.cancelReasonIncident,
      _ => l10n.cancelReasonOther,
    };

/// Estado en lenguaje claro ("Buscando domiciliario", "En camino") en una píldora del tono del estado.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status, this.large = false, this.mode});

  final String status;
  final bool large;

  /// Modo del pedido (E15): el directo nombra algunos hitos a su manera.
  final String? mode;

  @override
  Widget build(BuildContext context) {
    final colors = toneColors(statusTone(status));
    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 12 : 10, vertical: large ? 6 : 4),
      decoration: BoxDecoration(color: colors.background, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusIcon(status), size: large ? 16 : 14, color: colors.foreground),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              statusLabel(AppLocalizations.of(context), status, mode: mode),
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.foreground, fontWeight: FontWeight.w800, fontSize: large ? 14 : 12),
            ),
          ),
        ],
      ),
    );
  }
}

/// Hora de lanzamiento: Villagarzón. Cuando haya más municipios, llegará con el pedido.
const orderTimeZone = 'America/Bogota';

/// "21 oct · 3:40 p. m." en la hora del municipio, sin depender de la zona del teléfono.
String orderDate(DateTime at, String language) {
  final local = municipalTime(at, orderTimeZone);
  const es = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final month = (language == 'en' ? en : es)[local.month - 1];
  return '${language == 'en' ? '$month ${local.day}' : '${local.day} $month'} · ${orderTime(at, language)}';
}

String orderTime(DateTime at, String language) => formatClock(municipalTime(at, orderTimeZone), language);
