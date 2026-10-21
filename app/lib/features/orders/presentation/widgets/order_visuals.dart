import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../business/domain/business.dart';

/// Ícono, tono y texto de cada estado del pedido (mismos que la web). Los estados vienen del catálogo de
/// la API: uno nuevo sin texto propio se muestra con su código y el ícono genérico.

enum StatusTone { attention, done, off, progress }

IconData statusIcon(String status) => switch (status) {
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

String statusLabel(AppLocalizations l10n, String status) => switch (status) {
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

String? statusBody(AppLocalizations l10n, String status) => switch (status) {
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

String paymentLabel(AppLocalizations l10n, String method) => switch (method) {
      'CASH' => l10n.payCash,
      'NEQUI' => l10n.payNequi,
      'DAVIPLATA' => l10n.payDaviplata,
      'BANK_TRANSFER' => l10n.payBankTransfer,
      _ => method,
    };

/// Estado en lenguaje claro ("Buscando domiciliario", "En camino") en una píldora del tono del estado.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status, this.large = false});

  final String status;
  final bool large;

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
              statusLabel(AppLocalizations.of(context), status),
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
