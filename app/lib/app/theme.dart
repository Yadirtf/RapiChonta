import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Mismos tokens de marca que la web (web/src/app/globals.css).
class AppColors {
  static const brand = Color(0xFFFFC531);
  /// Chontaduro (Bactris gasipaes): el fruto que da nombre a la marca.
  static const chonta = Color(0xFFE4572E);
  static const chontaStrong = Color(0xFFB83A1B);
  static const chontaSoft = Color(0xFFFDE4D8);

  /// Acento sobre fondo claro: el chontaduro maduro.
  static const brandStrong = chontaStrong;
  static const ink = Color(0xFF14121F);
  static const surface = Color(0xFFF4F2EE);
  static const cream = Color(0xFFFFF7E2);
  static const leaf = Color(0xFF1F7A4D);
}

class AppTheme {
  /// Barras del sistema sobre fondo claro, aunque el teléfono esté en modo oscuro.
  static const systemBars = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: AppColors.surface,
    systemNavigationBarIconBrightness: Brightness.dark,
  );

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brand,
          brightness: Brightness.light,
          primary: AppColors.brand,
          onPrimary: AppColors.ink,
          surface: AppColors.surface,
        ),
        scaffoldBackgroundColor: AppColors.surface,
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.ink,
          elevation: 0,
          scrolledUnderElevation: 0,
          systemOverlayStyle: systemBars,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: AppColors.ink.withValues(alpha: 0.12))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: AppColors.ink.withValues(alpha: 0.12))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: AppColors.ink, width: 1.5)),
          floatingLabelStyle: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600),
        ),
        segmentedButtonTheme: SegmentedButtonThemeData(
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: AppColors.ink,
            selectedForegroundColor: Colors.white,
            backgroundColor: Colors.white,
            foregroundColor: AppColors.ink,
            minimumSize: const Size.fromHeight(46),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.ink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: AppColors.ink, textStyle: const TextStyle(fontWeight: FontWeight.w700))),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.ink,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
        ),
      );
}
