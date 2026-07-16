import 'package:equatable/equatable.dart';
import 'enums.dart';

/// Astrologer directory entity (see DATA_MODEL.md). Money fields are display-only
/// on the client; the backend owns them.
class Astrologer extends Equatable {
  const Astrologer({
    required this.id,
    required this.name,
    this.profilePhoto,
    this.about = '',
    this.experience = 0,
    this.languages = const [],
    this.expertise = const [],
    this.rating = 0,
    this.totalReviews = 0,
    this.totalConsultations = 0,
    this.followers = 0,
    this.responseTimeSec = 0,
    this.onlineStatus = false,
    this.available = false,
    this.verified = false,
    this.featured = false,
    this.risingStar = false,
    this.status = AstrologerStatus.pending,
    this.earnings = 0,
    this.pendingPayout = 0,
    this.ratePerMinutePaise = 900,
    this.chatRatePaise,
    this.voiceRatePaise,
    this.videoRatePaise,
    this.commissionPercent = 20,
    this.isAI = false,
    this.quickReplies = const [],
    this.availability = const {},
  });

  final String id;
  final String name;
  final String? profilePhoto;
  final String about;
  final int experience;
  final List<String> languages;
  final List<String> expertise;
  final double rating;
  final int totalReviews;
  final int totalConsultations;
  final int followers;
  final int responseTimeSec;
  final bool onlineStatus;
  final bool available;
  final bool verified;
  final bool featured;
  final bool risingStar; // admin-curated "Rising Stars" home rail
  final AstrologerStatus status;
  final int earnings; // paise, lifetime gross (astrologer-side display)
  final int pendingPayout; // paise, accrued net earnings not yet paid out
  final int ratePerMinutePaise; // legacy single rate / fallback for the 3 below
  // Per-type rates (paise/min). Null → falls back to ratePerMinutePaise.
  final int? chatRatePaise;
  final int? voiceRatePaise;
  final int? videoRatePaise;
  final num commissionPercent; // platform cut %; astrologer keeps (100 - this)%

  /// Price per minute (paise) for a given consultation type, with fallback to
  /// the legacy single rate. Mirror of the server's per-type pricing.
  int rateForTypePaise(ConsultationType type) {
    final r = switch (type) {
      ConsultationType.voice => voiceRatePaise,
      ConsultationType.video => videoRatePaise,
      ConsultationType.chat => chatRatePaise,
    };
    return (r != null && r > 0) ? r : ratePerMinutePaise;
  }
  final bool isAI; // AI persona vs a human astrologer
  final List<String> quickReplies;
  final Map<String, dynamic> availability;

  /// Astrologer's NET take-home for a gross (customer-charged) paise amount,
  /// after the platform commission. Use this for any earnings the astrologer
  /// sees, so period aggregates match the net payout figures.
  int netOf(int grossPaise) => (grossPaise * (100 - commissionPercent) / 100).round();

  // Whether to show the astrologer as online. AI personas have no presence
  // heartbeat, so they're always "on" once approved.
  bool get isOnline => onlineStatus || isAI;

  // `available` is a busy flag toggled by the session lifecycle; AI personas are
  // never busy and never go offline, so they're consultable whenever approved.
  bool get isConsultable =>
      (onlineStatus || isAI) && (available || isAI) && status == AstrologerStatus.approved;

  /// Display label for the per-minute price, e.g. "₹9/min" or "₹12.50/min".
  String get rateLabel {
    final r = ratePerMinutePaise / 100;
    final s = r == r.roundToDouble() ? r.toStringAsFixed(0) : r.toStringAsFixed(2);
    return '₹$s/min';
  }

  factory Astrologer.fromMap(String id, Map<String, dynamic> m) {
    return Astrologer(
      id: id,
      name: (m['name'] ?? '') as String,
      profilePhoto: m['profilePhoto'] as String?,
      about: (m['about'] ?? '') as String,
      experience: ((m['experience'] ?? 0) as num).toInt(),
      languages: List<String>.from(m['languages'] ?? const []),
      expertise: List<String>.from(m['expertise'] ?? const []),
      rating: ((m['rating'] ?? 0) as num).toDouble(),
      totalReviews: ((m['totalReviews'] ?? 0) as num).toInt(),
      totalConsultations: ((m['totalConsultations'] ?? 0) as num).toInt(),
      followers: ((m['followers'] ?? 0) as num).toInt(),
      responseTimeSec: ((m['responseTimeSec'] ?? 0) as num).toInt(),
      onlineStatus: (m['onlineStatus'] ?? false) as bool,
      available: (m['available'] ?? false) as bool,
      verified: (m['verified'] ?? false) as bool,
      featured: (m['featured'] ?? false) as bool,
      risingStar: (m['risingStar'] ?? false) as bool,
      status: AstrologerStatus.fromString(m['accountStatus'] as String?),
      earnings: ((m['earnings'] ?? 0) as num).toInt(),
      pendingPayout: ((m['pendingPayout'] ?? 0) as num).toInt(),
      ratePerMinutePaise: ((m['ratePerMinutePaise'] ?? 900) as num).toInt(),
      chatRatePaise: (m['chatRatePaise'] as num?)?.toInt(),
      voiceRatePaise: (m['voiceRatePaise'] as num?)?.toInt(),
      videoRatePaise: (m['videoRatePaise'] as num?)?.toInt(),
      commissionPercent: (m['commissionPercent'] ?? 20) as num,
      isAI: (m['isAI'] ?? false) as bool,
      quickReplies: List<String>.from(m['quickReplies'] ?? const []),
      availability: Map<String, dynamic>.from(m['availability'] ?? const {}),
    );
  }

  @override
  List<Object?> get props => [
        id, name, profilePhoto, about, experience, languages, expertise, rating,
        totalReviews, totalConsultations, followers, responseTimeSec,
        onlineStatus, available, verified, featured, risingStar, status, earnings,
        pendingPayout, ratePerMinutePaise, chatRatePaise, voiceRatePaise, videoRatePaise,
        commissionPercent, isAI, quickReplies, availability,
      ];
}
