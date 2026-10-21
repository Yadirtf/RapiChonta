import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../../core/error/failure.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/domain/entities/account.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/widgets/account_sheets.dart';
import '../../../auth/presentation/widgets/error_text.dart';
import '../../../establishments/presentation/widgets/storefront.dart' show Awning;
import '../../../notifications/presentation/widgets/notification_bell.dart';
import '../../../orders/presentation/widgets/order_route.dart' show TicketClipper;
import '../../../orders/presentation/widgets/order_visuals.dart';
import '../../../orders/presentation/widgets/store_page.dart';
import '../../data/location_tracker.dart';
import '../../domain/courier.dart';
import '../courier_providers.dart';
import '../widgets/duty_widgets.dart';
import '../widgets/offer_card.dart';
import '../widgets/pending_ribbon.dart';

/// Inicio del modo domiciliario (H08.1, H08.2): la palanca de Disponible, las ofertas que llegan y el pedido
/// en curso. El paisaje de Villagarzón arriba, como el menú del cliente: es la misma app, vista desde la moto.
class CourierHomePage extends ConsumerStatefulWidget {
  const CourierHomePage({super.key});

  @override
  ConsumerState<CourierHomePage> createState() => _CourierHomePageState();
}

class _CourierHomePageState extends ConsumerState<CourierHomePage> with WidgetsBindingObserver {
  bool _switching = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Al volver de los ajustes del teléfono (permiso o GPS), se vuelve a mirar.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(locationAccessProvider);
      ref.invalidate(courierStatusProvider);
      ref.read(pendingStepsProvider.notifier).flush();
    }
  }

  void _say(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));

  Future<void> _toggle(bool on) async {
    final l10n = AppLocalizations.of(context);
    if (on && !await _ensureLocation()) return;
    setState(() => _switching = true);
    try {
      await ref.read(courierStatusProvider.notifier).setAvailable(on);
    } catch (error) {
      if (mounted) _say(errorText(l10n, error));
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  /// Sin permiso de ubicación no se puede estar disponible: primero se explica para qué es, luego lo pide
  /// el sistema. Si quedó negado para siempre o el GPS está apagado, se abren los ajustes.
  Future<bool> _ensureLocation() async {
    var access = await locationAccess();
    if (access == LocationAccess.granted) return true;
    if (!mounted) return false;
    final go = await LocationWhySheet.show(context, access);
    if (go != true) return false;
    switch (access) {
      case LocationAccess.serviceOff:
        await Geolocator.openLocationSettings();
      case LocationAccess.deniedForever:
        await Geolocator.openAppSettings();
      case LocationAccess.denied || LocationAccess.granted:
        access = await locationAccess(request: true);
    }
    ref.invalidate(locationAccessProvider);
    return access == LocationAccess.granted;
  }

  Future<void> _take(CourierOffer offer) async {
    final l10n = AppLocalizations.of(context);
    try {
      final code = await ref.read(courierRepositoryProvider).accept(offer.offerId);
      ref.invalidate(courierStatusProvider);
      ref.invalidate(courierTripProvider);
      if (mounted) context.push('/turno/pedido/$code');
    } catch (error) {
      if (mounted) _say(errorText(l10n, error));
      ref.invalidate(courierOffersProvider);
    }
  }

  Future<void> _skip(CourierOffer offer) async {
    try {
      await ref.read(courierRepositoryProvider).reject(offer.offerId);
    } on Failure {
      // Ya vencida o cerrada: igual desaparece de la lista.
    }
    ref.invalidate(courierOffersProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final account = ref.watch(sessionProvider).value;
    final status = ref.watch(courierStatusProvider);

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.chonta,
        onRefresh: () async {
          ref.invalidate(courierOffersProvider);
          ref.invalidate(courierTripProvider);
          ref.invalidate(courierStatusProvider);
          await ref.read(courierStatusProvider.future);
        },
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _ShiftHeader(name: account?.givenNames ?? ''),
            Transform.translate(
              offset: const Offset(0, -34),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 640),
                  child: status.when(
                    loading: () => const DutyCard(child: SizedBox(height: 64, child: Center(child: CircularProgressIndicator(color: AppColors.chonta)))),
                    error: (error, _) => DoorCard(
                      icon: Icons.cloud_off_rounded,
                      title: l10n.courierLoadError,
                      body: errorText(l10n, error),
                      action: OutlinedButton(onPressed: () => ref.invalidate(courierStatusProvider), child: Text(l10n.ordersRetry)),
                    ),
                    data: (status) => status == null
                        ? const SizedBox.shrink()
                        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            _DutyPanel(status: status, busy: _switching, onChanged: status.verified ? _toggle : null),
                            const SizedBox(height: 14),
                            const PendingStepsRibbon(),
                            ..._body(context, status, language),
                            if (account != null && account.canSwitchMode) ...[
                              const SizedBox(height: 22),
                              _CustomerModeButton(account: account, blocked: status.activeOrder != null, onError: _say),
                            ],
                          ]),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _body(BuildContext context, CourierStatus status, String language) {
    final l10n = AppLocalizations.of(context);
    if (!status.verified) {
      return [DoorCard(icon: Icons.verified_user_rounded, title: l10n.courierNotVerifiedTitle, body: l10n.courierNotVerifiedBody)];
    }
    final active = status.activeOrder;
    if (active != null) return [_ActiveTripTicket(code: active.code, status: active.status)];
    final access = ref.watch(locationAccessProvider).value;
    if (status.available) {
      final offers = ref.watch(courierOffersProvider(language));
      final list = offers.value ?? const <CourierOffer>[];
      return [
        if (access != null && access != LocationAccess.granted) ...[_LocationLost(access: access, onFix: () => _ensureLocation()), const SizedBox(height: 14)],
        if (list.isEmpty)
          _Searching()
        else
          for (final offer in list) ...[
            OfferCard(
              key: ValueKey(offer.offerId),
              offer: offer,
              onTake: () => _take(offer),
              onSkip: () => _skip(offer),
              onExpired: () => ref.invalidate(courierOffersProvider),
            ),
            const SizedBox(height: 16),
          ],
      ];
    }
    return [_Resting()];
  }
}

/// Paisaje de Villagarzón bajo el vidrio de tinta, con la chonta en moto y el saludo.
class _ShiftHeader extends StatelessWidget {
  const _ShiftHeader({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.ink,
        image: DecorationImage(image: AssetImage(BrandAssets.sidebarScene), fit: BoxFit.cover, alignment: Alignment(0, 0.2)),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.ink.withValues(alpha: 0.55), AppColors.ink.withValues(alpha: 0.78)],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 52),
            child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              const BrandEmblem(width: 68),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Eyebrow(l10n.courierModeLabel, color: AppColors.brand),
                  const SizedBox(height: 2),
                  Text(
                    name.isEmpty ? l10n.courierShiftTitle : l10n.courierHello(name),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.8, height: 1.1),
                  ),
                ]),
              ),
              const NotificationBell(onDark: true),
              IconButton(
                tooltip: l10n.menuMyAccount,
                onPressed: () => context.push('/cuenta'),
                icon: const Icon(Icons.person_rounded, color: Colors.white),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// La palanca con su estado en palabras: "Disponible desde las 3:40 p. m." o "Descansando".
class _DutyPanel extends StatelessWidget {
  const _DutyPanel({required this.status, required this.busy, required this.onChanged});

  final CourierStatus status;
  final bool busy;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final on = status.available;
    final since = status.availableSince;
    // Con un pedido no se apaga desde aquí: la API exige terminarlo (el GPS sigue hasta entregarlo).
    final locked = status.activeOrder != null && !on;
    return DutyCard(
      padding: const EdgeInsets.fromLTRB(20, 18, 16, 18),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Text(
                on ? l10n.courierOnDuty : l10n.courierOffDuty,
                key: ValueKey(on),
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6, color: on ? AppColors.leaf : AppColors.ink),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              on && since != null ? l10n.courierSince(orderTime(since, language)) : (on ? l10n.courierOnDutyHint : l10n.courierOffDutyHint),
              style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6), fontSize: 13),
            ),
          ]),
        ),
        const SizedBox(width: 12),
        DutySwitch(on: on, busy: busy, label: l10n.courierToggleLabel, onChanged: locked ? null : onChanged),
      ]),
    );
  }
}

class _Searching extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DutyCard(
      padding: const EdgeInsets.fromLTRB(20, 26, 20, 24),
      child: Column(children: [
        const SearchPulse(),
        const SizedBox(height: 12),
        Semantics(liveRegion: true, child: Text(l10n.courierSearching, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
        const SizedBox(height: 6),
        Text(l10n.courierSearchingBody, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
      ]),
    );
  }
}

class _Resting extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DutyCard(
      color: AppColors.cream,
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
      child: Column(children: [
        Opacity(opacity: 0.85, child: Image.asset(BrandAssets.mark, width: 84, excludeFromSemantics: true)),
        const SizedBox(height: 12),
        Text(l10n.courierRestingTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Text(l10n.courierRestingBody, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
      ]),
    );
  }
}

/// Sin permiso o con el GPS apagado mientras está disponible: no le llegarán pedidos cercanos.
class _LocationLost extends StatelessWidget {
  const _LocationLost({required this.access, required this.onFix});

  final LocationAccess access;
  final VoidCallback onFix;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      decoration: BoxDecoration(color: AppColors.chonta, borderRadius: BorderRadius.circular(18)),
      child: Row(children: [
        const Icon(Icons.location_off_rounded, color: Colors.white),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            access == LocationAccess.serviceOff ? l10n.courierLocationOff : l10n.courierLocationDenied,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
        TextButton(
          style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white24),
          onPressed: onFix,
          child: Text(access == LocationAccess.denied ? l10n.courierLocationAllow : l10n.courierLocationSettings),
        ),
      ]),
    );
  }
}

/// El pedido en curso como tiquete de tinta: el código, el estado y "Continuar".
class _ActiveTripTicket extends StatelessWidget {
  const _ActiveTripTicket({required this.code, required this.status});

  final String code;
  final String status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ClipPath(
      clipper: const TicketClipper(notchAt: 0.66),
      child: Material(
        color: AppColors.ink,
        child: InkWell(
          onTap: () => context.push('/turno/pedido/$code'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Eyebrow(l10n.courierActiveTitle, color: AppColors.brand)),
                Text(code, style: const TextStyle(color: AppColors.brand, fontFamily: 'monospace', fontWeight: FontWeight.w900, letterSpacing: 1.5)),
              ]),
              const SizedBox(height: 12),
              StatusBadge(status: status, large: true),
              const SizedBox(height: 22),
              Row(children: [
                Expanded(child: Text(l10n.courierActiveBody, style: const TextStyle(color: Colors.white70))),
                const SizedBox(width: 12),
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                  onPressed: () => context.push('/turno/pedido/$code'),
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(l10n.courierContinue),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

/// RF-06: volver a pedir como cliente. Con un pedido en curso no se puede (la API también lo impide).
class _CustomerModeButton extends ConsumerStatefulWidget {
  const _CustomerModeButton({required this.account, required this.blocked, required this.onError});

  final Account account;
  final bool blocked;
  final ValueChanged<String> onError;

  @override
  ConsumerState<_CustomerModeButton> createState() => _CustomerModeButtonState();
}

class _CustomerModeButtonState extends ConsumerState<_CustomerModeButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(children: [
      OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        onPressed: widget.blocked || _busy
            ? null
            : () async {
                setState(() => _busy = true);
                try {
                  await switchMode(context, ref, widget.account);
                } catch (error) {
                  widget.onError(errorText(l10n, error));
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
        icon: const Icon(Icons.shopping_basket_rounded),
        label: Text(l10n.switchToCustomer),
      ),
      if (widget.blocked)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(l10n.courierToCustomerBlocked, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.ink.withValues(alpha: 0.55))),
        ),
      const SizedBox(height: 28),
    ]);
  }
}

/// Antes de pedir el permiso del sistema: para qué es la ubicación y qué no se hace con ella.
class LocationWhySheet extends StatelessWidget {
  const LocationWhySheet({super.key, required this.access});

  final LocationAccess access;

  static Future<bool?> show(BuildContext context, LocationAccess access) => showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => LocationWhySheet(access: access),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Awning(height: 22, stripe: 16),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Center(child: SearchPulse(size: 120)),
              const SizedBox(height: 8),
              Text(l10n.courierWhyTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: -0.6)),
              const SizedBox(height: 6),
              Text(l10n.courierWhyBody, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.65))),
              const SizedBox(height: 18),
              _Point(icon: Icons.near_me_rounded, text: l10n.courierWhyOffers),
              _Point(icon: Icons.storefront_rounded, text: l10n.courierWhyArrival),
              _Point(icon: Icons.visibility_off_rounded, text: l10n.courierWhyPrivacy),
              _Point(icon: Icons.bedtime_rounded, text: l10n.courierWhyOff),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(switch (access) {
                  LocationAccess.serviceOff || LocationAccess.deniedForever => l10n.courierLocationSettings,
                  _ => l10n.courierWhyAccept,
                }),
              ),
              TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.pushAskLater)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Transform.rotate(
            angle: -0.08,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: AppColors.chontaSoft, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, size: 19, color: AppColors.chontaStrong),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700))),
        ]),
      );
}
