import 'package:flutter/material.dart';

/// Íconos que el administrador puede elegir (lista cerrada de la API, nombres de lucide) → Material.
const _icons = <String, IconData>{
  'utensils-crossed': Icons.fastfood_rounded,
  'store': Icons.storefront_rounded,
  'shopping-basket': Icons.shopping_basket_rounded,
  'package': Icons.inventory_2_rounded,
  'pill': Icons.medication_rounded,
  'pizza': Icons.local_pizza_rounded,
  'beef': Icons.kebab_dining_rounded,
  'coffee': Icons.coffee_rounded,
  'croissant': Icons.bakery_dining_rounded,
  'ice-cream-cone': Icons.icecream_rounded,
  'beer': Icons.sports_bar_rounded,
  'sandwich': Icons.lunch_dining_rounded,
  'fish': Icons.set_meal_rounded,
  'salad': Icons.rice_bowl_rounded,
  'apple': Icons.eco_rounded,
  'cake-slice': Icons.cake_rounded,
  'shirt': Icons.checkroom_rounded,
  'hammer': Icons.hardware_rounded,
  'dog': Icons.pets_rounded,
  'flower': Icons.local_florist_rounded,
  'gift': Icons.card_giftcard_rounded,
  'smartphone': Icons.smartphone_rounded,
  'book-open': Icons.menu_book_rounded,
  'sparkles': Icons.auto_awesome_rounded,
};

IconData categoryIcon(String? name) => _icons[name] ?? Icons.storefront_rounded;
