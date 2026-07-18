import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// Portal-managed home pop-up (`homeSections/popup`). The admin turns it on,
/// targets an audience (all / paid / unpaid), and picks the look; the app shows
/// it once per launch on the home screen. Everything here is editable from the
/// portal with no rebuild.
class HomePopup {
  const HomePopup({
    required this.active,
    required this.audience,
    required this.displayMode,
    required this.theme,
    required this.title,
    required this.body,
    required this.ctaLabel,
    required this.deeplink,
    required this.code,
    required this.image,
    required this.imageStyle,
    required this.imageFill,
  });

  final bool active;
  final String audience; // all | paid | unpaid
  final String displayMode; // small | half | full
  final String theme; // '' = plain centre card
  final String title;
  final String body;
  final String ctaLabel;
  final String deeplink;
  final String code;
  final String image;
  final String imageStyle; // banner | portrait
  final bool imageFill;

  /// Does this pop-up target a user with the given paid state?
  bool matches({required bool hasRecharged}) {
    switch (audience) {
      case 'paid':
        return hasRecharged;
      case 'unpaid':
        return !hasRecharged;
      default:
        return true; // 'all'
    }
  }

  factory HomePopup.fromMap(Map<String, dynamic> m) => HomePopup(
        active: (m['active'] ?? false) as bool,
        audience: (m['audience'] ?? 'all') as String,
        displayMode: (m['displayMode'] ?? 'small') as String,
        theme: (m['theme'] ?? '') as String,
        title: (m['title'] ?? '') as String,
        body: (m['body'] ?? '') as String,
        ctaLabel: (m['ctaLabel'] ?? '') as String,
        deeplink: (m['deeplink'] ?? '') as String,
        code: (m['code'] ?? '') as String,
        image: (m['image'] ?? '') as String,
        imageStyle: (m['imageStyle'] ?? 'banner') as String,
        imageFill: (m['imageFill'] ?? false) as bool,
      );

  static const empty = HomePopup(
    active: false, audience: 'all', displayMode: 'small', theme: '', title: '',
    body: '', ctaLabel: '', deeplink: '', code: '', image: '', imageStyle: 'banner', imageFill: false,
  );
}

// Plain (non-autoDispose) so a `ref.read` poll on app open reliably sees data —
// an autoDispose provider would tear down between reads before the doc arrives.
final homePopupProvider = StreamProvider<HomePopup>((ref) {
  final db = ref.watch(firestoreProvider);
  return db.collection('homeSections').doc('popup').snapshots().map(
        (d) => d.exists ? HomePopup.fromMap(d.data() ?? const {}) : HomePopup.empty,
      );
});

/// Guards the home pop-up to once per app launch.
final homePopupShownProvider = StateProvider<bool>((_) => false);
