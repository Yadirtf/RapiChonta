import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/brand_logo.dart';
import '../../../../app/theme.dart';
import '../../../establishments/presentation/widgets/storefront.dart';

/// Encabezado de las páginas del cliente fuera del mapa (pedido, mis pedidos): el toldo de la tienda de
/// barrio, la flecha de regreso y el título junto a la mascota (igual que en la web).
class StoreHeader extends StatelessWidget {
  const StoreHeader({super.key, required this.title, required this.backTo, required this.backLabel, this.trailing});

  final String title;
  final String backTo;
  final String backLabel;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          const Awning(height: 64),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 30, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Material(
                    color: Colors.white,
                    shape: const CircleBorder(),
                    elevation: 4,
                    shadowColor: AppColors.ink.withValues(alpha: 0.3),
                    child: IconButton(
                      tooltip: backLabel,
                      onPressed: () => context.canPop() ? context.pop() : context.go(backTo),
                      icon: const Icon(Icons.arrow_back_rounded, color: AppColors.ink),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Container(
                        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                        child: const BrandLogo(size: 44, showName: false, onDark: false),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(title, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.8, color: AppColors.ink)),
                      ),
                      ?trailing,
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      );
}

/// Tarjeta de puerta (canasta vacía, pedido no encontrado): toldo pequeño, un ícono y una sola acción.
class DoorCard extends StatelessWidget {
  const DoorCard({super.key, required this.icon, required this.title, required this.body, this.action});

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          clipBehavior: Clip.antiAlias,
          elevation: 6,
          shadowColor: AppColors.ink.withValues(alpha: 0.2),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Awning(height: 18, stripe: 14),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 26),
                child: Column(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(color: AppColors.brand.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(22)),
                      child: Icon(icon, size: 32, color: AppColors.chontaStrong),
                    ),
                    const SizedBox(height: 14),
                    Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                    const SizedBox(height: 6),
                    Text(body, textAlign: TextAlign.center, style: TextStyle(color: AppColors.ink.withValues(alpha: 0.6))),
                    if (action != null) ...[const SizedBox(height: 20), action!],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

/// Paso del pedido como renglón numerado de la comanda: el número en un sello de chontaduro que se
/// vuelve hoja cuando el paso ya está listo.
class StepCard extends StatelessWidget {
  const StepCard({super.key, required this.number, required this.title, required this.done, required this.child});

  final int number;
  final String title;
  final bool done;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(26),
          boxShadow: [BoxShadow(color: AppColors.ink.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Transform.rotate(
                  angle: -0.1,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: done ? AppColors.leaf : AppColors.chonta, borderRadius: BorderRadius.circular(11)),
                    child: done
                        ? const Icon(Icons.check_rounded, color: Colors.white, size: 20)
                        : Text('$number', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Semantics(header: true, child: Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -0.4))),
                ),
              ],
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      );
}

/// Ficha seleccionable (lugar guardado, billete, destinatario): marco de tinta cuando está elegida.
class ChoiceTile extends StatelessWidget {
  const ChoiceTile({super.key, required this.selected, required this.onTap, required this.child, this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 10)});

  final bool selected;
  final VoidCallback onTap;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        inMutuallyExclusiveGroup: true,
        button: true,
        child: Material(
          color: selected ? AppColors.brand.withValues(alpha: 0.25) : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: selected ? AppColors.ink : AppColors.ink.withValues(alpha: 0.1), width: 2),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Padding(
              padding: padding,
              child: DefaultTextStyle.merge(style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink), child: child),
            ),
          ),
        ),
      );
}
