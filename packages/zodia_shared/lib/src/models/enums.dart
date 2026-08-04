/// Shared enums mirroring the backend string values.
library;

enum ConsultationType {
  chat,
  voice,
  video;

  static ConsultationType fromString(String? v) =>
      ConsultationType.values.firstWhere((e) => e.name == v, orElse: () => ConsultationType.chat);
}

enum ConsultationStatus {
  waiting,
  active,
  paused,
  completed,
  cancelled,
  expired;

  static ConsultationStatus fromString(String? v) => ConsultationStatus.values
      .firstWhere((e) => e.name == v, orElse: () => ConsultationStatus.waiting);

  bool get isOpen =>
      this == waiting || this == active || this == paused;
  bool get isTerminal =>
      this == completed || this == cancelled || this == expired;
}

enum AstrologerStatus {
  pending,
  approved,
  suspended,
  rejected,
  disabled;

  static AstrologerStatus fromString(String? v) => AstrologerStatus.values
      .firstWhere((e) => e.name == v, orElse: () => AstrologerStatus.pending);
}

enum TxnKind {
  recharge,
  consultation,
  refund,
  bonus,
  coupon,
  adjustment;

  static TxnKind fromString(String? v) =>
      TxnKind.values.firstWhere((e) => e.name == v, orElse: () => TxnKind.adjustment);
}
