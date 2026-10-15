import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/establishment.dart';

/// Texto traducido de cada categoría. El dominio no conoce idiomas; la presentación sí.
extension EstablishmentCategoryLabel on EstablishmentCategory {
  String label(AppLocalizations l10n) => switch (this) {
        EstablishmentCategory.fastFood => l10n.categoryFastFood,
        EstablishmentCategory.restaurant => l10n.categoryRestaurant,
        EstablishmentCategory.supermarket => l10n.categorySupermarket,
        EstablishmentCategory.store => l10n.categoryStore,
        EstablishmentCategory.pharmacy => l10n.categoryPharmacy,
      };
}
