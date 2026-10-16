import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme.dart';
import '../../../../core/config/env.dart';
import '../../../../l10n/app_localizations.dart';
import '../../domain/entities/account.dart';

const _slugs = {
  'TERMS_OF_SERVICE': 'terminos',
  'DATA_PROCESSING_POLICY': 'politica-de-datos',
  'COURIER_LOCATION_AUTHORIZATION': 'autorizacion-ubicacion',
};

/// Abre el documento legal publicado en la web.
Future<void> openLegal(String type) =>
    launchUrl(Uri.parse('${Env.webUrl}/legal/${_slugs[type] ?? ''}'), mode: LaunchMode.inAppBrowserView);

String legalTitle(AppLocalizations l10n, String type) => switch (type) {
      'TERMS_OF_SERVICE' => l10n.legalTerms,
      'DATA_PROCESSING_POLICY' => l10n.legalDataPolicy,
      'COURIER_LOCATION_AUTHORIZATION' => l10n.legalCourierLocation,
      _ => type,
    };

/// Una casilla por documento vigente: la aceptación queda registrada con su versión (consents).
class ConsentChecklist extends StatelessWidget {
  const ConsentChecklist({super.key, required this.documents, required this.accepted, required this.onChanged});

  final List<LegalDocument> documents;
  final Set<String> accepted;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      children: [
        for (final doc in documents)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: accepted.contains(doc.id) ? AppColors.brand.withValues(alpha: 0.12) : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: AppColors.ink.withValues(alpha: accepted.contains(doc.id) ? 0.3 : 0.1)),
              ),
              clipBehavior: Clip.antiAlias,
              child: CheckboxListTile(
                value: accepted.contains(doc.id),
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: AppColors.ink,
                checkColor: AppColors.brand,
                onChanged: (checked) => onChanged(checked == true ? ({...accepted, doc.id}) : ({...accepted}..remove(doc.id))),
                title: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${l10n.acceptPrefix(doc.type)} '),
                    TextSpan(
                      text: legalTitle(l10n, doc.type),
                      style: const TextStyle(fontWeight: FontWeight.w700, decoration: TextDecoration.underline, decorationColor: AppColors.brand, decorationThickness: 2),
                      recognizer: TapGestureRecognizer()..onTap = () => openLegal(doc.type),
                    ),
                  ]),
                  style: const TextStyle(fontSize: 14),
                ),
                subtitle: Text(l10n.legalVersion(doc.versionLabel), style: const TextStyle(fontSize: 12)),
              ),
            ),
          ),
      ],
    );
  }
}
