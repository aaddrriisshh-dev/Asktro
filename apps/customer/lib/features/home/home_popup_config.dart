import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

/// One extra line in the "Total Payment" breakdown (portal-editable), e.g.
/// {label: 'Discount', amountPaise: -1000}. Amount may be negative.
class PopupBreakupRow {
  const PopupBreakupRow({required this.label, required this.amountPaise});
  final String label;
  final int amountPaise;

  factory PopupBreakupRow.fromMap(Map<String, dynamic> m) => PopupBreakupRow(
        label: (m['label'] ?? '') as String,
        amountPaise: (m['amountPaise'] as num?)?.toInt() ?? 0,
      );
}

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
    this.offerGetPaise = 7700,
    this.rechargeBasePaise = 2500,
    this.rechargePlanId = 'promo_welcome',
    this.titleWord1 = '',
    this.titleWord2 = '',
    this.gstRatePct = 18,
    this.showBreakup = true,
    this.totalOverridePaise,
    this.breakupRows = const [],
    this.bgTheme = '',
    this.particleStyle = 'mixed',
  });

  final bool active;
  final String audience; // all | paid | unpaid
  final String displayMode; // small | half | full
  final String theme; // '' = plain centre card, 'welcome_reward' = designed ₹-gift banner
  final String title;
  final String body;
  final String ctaLabel;
  final String deeplink;
  final String code;
  final String image;
  final String imageStyle; // banner | portrait
  final bool imageFill;

  // Only used by the 'welcome_reward' style — the designed welcome-offer banner
  // (welcome_offer.dart). Absent/empty → the app's existing hardcoded defaults,
  // so nothing changes for any other pop-up.
  final int offerGetPaise; // "Get ₹X in your wallet" headline number.
  final int rechargeBasePaise; // pre-GST base of the recharge button (GST added in UI).
  final String rechargePlanId; // recharge plan the button opens (/recharge?plan=<id>).

  // Two-tone headline words. When both are blank the banner shows its default
  // "Triple Dhamaka"; when set, word1 is navy and word2 is gold.
  final String titleWord1;
  final String titleWord2;

  // Total-payment breakdown controls (welcome_reward only).
  final double gstRatePct; // GST % applied to the base (default 18).
  final bool showBreakup; // show/hide the "Total Payment" ⓘ line.
  final int? totalOverridePaise; // null = auto (base + GST + extras).
  final List<PopupBreakupRow> breakupRows; // extra lines (discount / fee / …).

  // Look controls (welcome_reward only).
  final String bgTheme; // '' | lavender | aurora | midnight | nebula | emerald
  final String particleStyle; // mixed | stars | coins | none

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
        offerGetPaise: (m['offerGetPaise'] as num?)?.toInt() ?? 7700,
        rechargeBasePaise: (m['rechargeBasePaise'] as num?)?.toInt() ?? 2500,
        rechargePlanId: (m['rechargePlanId'] ?? 'promo_welcome') as String,
        titleWord1: (m['titleWord1'] ?? '') as String,
        titleWord2: (m['titleWord2'] ?? '') as String,
        gstRatePct: (m['gstRatePct'] as num?)?.toDouble() ?? 18,
        showBreakup: (m['showBreakup'] ?? true) as bool,
        totalOverridePaise: (m['totalOverridePaise'] as num?)?.toInt(),
        breakupRows: ((m['breakupRows'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(PopupBreakupRow.fromMap)
            .toList(),
        bgTheme: (m['bgTheme'] ?? '') as String,
        particleStyle: (m['particleStyle'] ?? 'mixed') as String,
      );

  static const empty = HomePopup(
    active: false, audience: 'all', displayMode: 'small', theme: '', title: '',
    body: '', ctaLabel: '', deeplink: '', code: '', image: '', imageStyle: 'banner', imageFill: false,
    offerGetPaise: 7700, rechargeBasePaise: 2500, rechargePlanId: 'promo_welcome',
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
