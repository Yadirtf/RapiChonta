import 'package:flutter/material.dart';

import 'theme.dart';

/// Marca de RapiChonta: la chonta domiciliaria en moto, con su gorra del Putumayo. Las imágenes salen de
/// Docs/marca/logo-original.jpeg con Docs/marca/generar_marca.py (las mismas de la web, web/src/assets/brand).
abstract final class BrandAssets {
  /// Emblema completo, sin fondo (428 × 458).
  static const emblem = 'assets/brand/emblem.webp';

  /// Cara de la mascota en su medallón crema: para tamaños donde el emblema no se lee.
  static const mark = 'assets/brand/mark.webp';

  /// Paisaje de Villagarzón (atardecer, montañas, selva y mercado), ya desenfocado, para el menú lateral.
  static const sidebarScene = 'assets/brand/sidebar_scene.jpg';
}

/// Emblema completo (insignia con el nombre). Se lee bien desde ~64 de ancho; por debajo, usar [BrandLogo].
class BrandEmblem extends StatelessWidget {
  const BrandEmblem({super.key, this.width = 128});

  final double width;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'RapiChonta',
      image: true,
      child: DecoratedBox(
        // Sombra suave para despegar el emblema del paisaje.
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: Image.asset(BrandAssets.emblem, width: width, filterQuality: FilterQuality.medium, excludeFromSemantics: true),
      ),
    );
  }
}

/// Marca pequeña (la mascota) con el nombre al lado, para barras y encabezados.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 40, this.showName = true, this.onDark = true});

  final double size;
  final bool showName;

  /// Fondo oscuro o claro: cambia el color del nombre y el filo del medallón.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final mark = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: onDark ? Colors.white24 : AppColors.ink.withValues(alpha: 0.1)),
        image: const DecorationImage(image: AssetImage(BrandAssets.mark), filterQuality: FilterQuality.medium),
      ),
    );
    if (!showName) return Semantics(label: 'RapiChonta', image: true, child: mark);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(child: mark),
        SizedBox(width: size / 4),
        Text.rich(
          TextSpan(children: [
            TextSpan(text: 'Rapi', style: TextStyle(color: onDark ? Colors.white : AppColors.ink)),
            TextSpan(text: 'Chonta', style: TextStyle(color: onDark ? AppColors.chonta : AppColors.chontaStrong)),
          ]),
          style: TextStyle(fontSize: size * 0.55, fontWeight: FontWeight.w800, letterSpacing: -0.4),
        ),
      ],
    );
  }
}
