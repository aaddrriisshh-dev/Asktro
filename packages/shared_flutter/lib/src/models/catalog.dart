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

/// Admin-managed promotional banner.
class Banner extends Equatable {
  const Banner({
    required this.id,
    required this.image,
    this.title = '',
    this.subtitle = '',
    this.cta,
    this.deeplink,
    this.placement = 'home',
    this.priority = 0,
  });

  final String id;
  final String image;
  final String title;
  final String subtitle;
  final String? cta;
  final String? deeplink;
  final String placement;
  final int priority;

  factory Banner.fromMap(String id, Map<String, dynamic> m) => Banner(
        id: id,
        image: (m['image'] ?? '') as String,
        title: (m['title'] ?? '') as String,
        subtitle: (m['subtitle'] ?? '') as String,
        cta: m['cta'] as String?,
        deeplink: m['deeplink'] as String?,
        placement: (m['placement'] ?? 'home') as String,
        priority: (m['priority'] ?? 0) as int,
      );

  @override
  List<Object?> get props => [id, image, title, subtitle, cta, deeplink, placement, priority];
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
