import 'package:flutter/material.dart';

/// Mismos tokens de marca que la web (web/src/app/globals.css).
class AppColors {
  static const brand = Color(0xFFFFC531);
  static const brandStrong = Color(0xFFE08A00);
  static const ink = Color(0xFF14121F);
  static const surface = Color(0xFFF4F2EE);
}

class AppTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brand,
          primary: AppColors.brand,
          onPrimary: AppColors.ink,
          surface: AppColors.surface,
        ),
        scaffoldBackgroundColor: AppColors.surface,
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
