import 'package:equatable/equatable.dart';
import 'enums.dart';

/// Admin-managed recharge plan.
class RechargePlan extends Equatable {
  const RechargePlan({
    required this.id,
    required this.amount,
    required this.walletCredit,
    this.bonus = 0,
    this.popular = false,
    this.recommended = false,
    this.displayOrder = 0,
    this.active = true,
  });

  final String id;
  final int amount; // paise paid
  final int walletCredit; // paise credited
  final int bonus; // paise bonus
  final bool popular;
  final bool recommended;
  final int displayOrder;
  final bool active;

  int get totalCredit => walletCredit + bonus;

  factory RechargePlan.fromMap(String id, Map<String, dynamic> m) => RechargePlan(
        id: id,
        amount: (m['amount'] ?? 0) as int,
        walletCredit: (m['walletCredit'] ?? m['amount'] ?? 0) as int,
        bonus: (m['bonus'] ?? 0) as int,
        popular: (m['popular'] ?? false) as bool,
        recommended: (m['recommended'] ?? false) as bool,
        displayOrder: (m['displayOrder'] ?? 0) as int,
        active: (m['active'] ?? true) as bool,
      );

  @override
  List<Object?> get props =>
      [id, amount, walletCredit, bonus, popular, recommended, displayOrder, active];
}

/// Admin-managed promotional banner. Named `PromoBanner` to avoid colliding
/// with Flutter's built-in `Banner` widget.
class PromoBanner extends Equatable {
  const PromoBanner({
    required this.id,
    required this.image,
    this.title = '',
    this.subtitle = '',
    this.cta,
    this.deeplink,
    this.placement = 'home',
    this.priority = 0,
    this.bgColor,
    this.textColor,
    this.displayMode = 'small',
    this.portraitImage,
    this.landingTitle,
    this.landingBody,
    this.landingBgColor,
    this.landingTextColor,
    this.createdAtMs = 0,
  });

  final String id;
  final String image;
  final String title;
  final String subtitle;
  final String? cta;
  final String? deeplink;
  final String placement;
  final int priority;
  // Small-strip styling.
  final String? bgColor;
  final String? textColor;
  // Landing view opened on tap: 'small' | 'half' | 'full'.
  final String displayMode;
  final String? portraitImage;
  final String? landingTitle;
  final String? landingBody;
  final String? landingBgColor;
  final String? landingTextColor;
  final int createdAtMs;

  bool get hasLanding => displayMode == 'half' || displayMode == 'full';

  // Tolerant of the admin composer's field names (description/ctaText) and the
  // legacy names (subtitle/cta). createdAtMs is supplied by the repository.
  factory PromoBanner.fromMap(String id, Map<String, dynamic> m, {int createdAtMs = 0}) => PromoBanner(
        id: id,
        image: (m['image'] ?? '') as String? ?? '',
        title: (m['title'] ?? '') as String? ?? '',
        subtitle: (m['description'] ?? m['subtitle'] ?? '') as String? ?? '',
        cta: (m['ctaText'] ?? m['cta']) as String?,
        deeplink: m['deeplink'] as String?,
        placement: (m['placement'] ?? 'home') as String? ?? 'home',
        priority: (m['priority'] ?? 0) as int? ?? 0,
        bgColor: m['bgColor'] as String?,
        textColor: m['textColor'] as String?,
        displayMode: (m['displayMode'] ?? 'small') as String? ?? 'small',
        portraitImage: m['portraitImage'] as String?,
        landingTitle: m['landingTitle'] as String?,
        landingBody: m['landingBody'] as String?,
        landingBgColor: m['landingBgColor'] as String?,
        landingTextColor: m['landingTextColor'] as String?,
        createdAtMs: createdAtMs,
      );

  @override
  List<Object?> get props => [id, image, title, subtitle, cta, deeplink, placement, priority,
        bgColor, textColor, displayMode, portraitImage, landingTitle, landingBody, landingBgColor, landingTextColor, createdAtMs];
}

/// Immutable wallet ledger row.
class WalletTransaction extends Equatable {
  const WalletTransaction({
    required this.id,
    required this.kind,
    required this.amount,
    this.balanceAfter = 0,
    this.note,
    this.createdAtMs,
  });

  final String id;
  final TxnKind kind;
  final int amount; // signed paise
  final int balanceAfter;
  final String? note;
  final int? createdAtMs;

  bool get isCredit => amount >= 0;

  factory WalletTransaction.fromMap(String id, Map<String, dynamic> m, {int? createdAtMs}) =>
      WalletTransaction(
        id: id,
        kind: TxnKind.fromString(m['kind'] as String?),
        amount: (m['amount'] ?? 0) as int,
        balanceAfter: (m['balanceAfter'] ?? 0) as int,
        note: m['note'] as String?,
        createdAtMs: createdAtMs,
      );

  @override
  List<Object?> get props => [id, kind, amount, balanceAfter, note, createdAtMs];
}

/// In-app notification.
class AppNotification extends Equatable {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    this.type = 'system',
    this.deeplink,
    this.read = false,
    this.createdAtMs,
  });

  final String id;
  final String title;
  final String body;
  final String type;
  final String? deeplink;
  final bool read;
  final int? createdAtMs;

  factory AppNotification.fromMap(String id, Map<String, dynamic> m, {int? createdAtMs}) =>
      AppNotification(
        id: id,
        title: (m['title'] ?? '') as String,
        body: (m['body'] ?? '') as String,
        type: (m['type'] ?? 'system') as String,
        deeplink: m['deeplink'] as String?,
        read: (m['read'] ?? false) as bool,
        createdAtMs: createdAtMs,
      );

  @override
  List<Object?> get props => [id, title, body, type, deeplink, read, createdAtMs];
}
