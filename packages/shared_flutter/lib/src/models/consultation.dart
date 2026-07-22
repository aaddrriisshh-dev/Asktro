import 'package:equatable/equatable.dart';
import 'enums.dart';

/// Live/finished consultation session. The client only reads these fields; all
/// billing/timer values are written by Cloud Functions.
class Consultation extends Equatable {
  const Consultation({
    required this.id,
    required this.customerId,
    required this.astrologerId,
    required this.type,
    required this.status,
    this.pricePerMinute = 900,
    this.billedSeconds = 0,
    this.duration = 0,
    this.totalCharged = 0,
    this.walletAfter = 0,
    this.remainingSec = 0,
    this.warnLevel = 0,
    this.networkStatus = 'ok',
    this.graceGranted = false,
    this.agoraChannel,
    this.receiptNo,
    this.rating,
    this.review,
    this.startTimeMs,
    this.endTimeMs,
    this.requestedSkill,
  });

  final String id;
  final String customerId;
  final String astrologerId;
  final ConsultationType type;
  final ConsultationStatus status;
  final int pricePerMinute; // paise
  final int billedSeconds;
  final int duration;
  final int totalCharged; // paise
  final int walletAfter; // paise
  final int remainingSec;
  final int warnLevel; // 0..3
  /// 'ok' normally; 'reconnecting' when a disconnect paused the session — the
  /// signal the client uses to auto-resume once the network is back.
  final String networkStatus;
  final bool graceGranted; // a one-time grace minute was gifted this session
  final String? agoraChannel;
  final String? receiptNo;
  final double? rating;
  final String? review;
  final int? startTimeMs;
  final int? endTimeMs;
  /// The skill the customer entered via ('palmistry' | 'numerology' | 'tarot'),
  /// so a HUMAN astrologer sees what reading the customer came for. Null for a
  /// normal (Vedic) session.
  final String? requestedSkill;

  Consultation copyWith({ConsultationStatus? status, int? remainingSec, int? warnLevel}) {
    return Consultation(
      id: id,
      customerId: customerId,
      astrologerId: astrologerId,
      type: type,
      status: status ?? this.status,
      pricePerMinute: pricePerMinute,
      billedSeconds: billedSeconds,
      duration: duration,
      totalCharged: totalCharged,
      walletAfter: walletAfter,
      remainingSec: remainingSec ?? this.remainingSec,
      warnLevel: warnLevel ?? this.warnLevel,
      graceGranted: graceGranted,
      agoraChannel: agoraChannel,
      receiptNo: receiptNo,
      rating: rating,
      review: review,
      startTimeMs: startTimeMs,
      endTimeMs: endTimeMs,
      requestedSkill: requestedSkill,
    );
  }

  factory Consultation.fromMap(String id, Map<String, dynamic> m) {
    int? ms(dynamic v) {
      if (v == null) return null;
      if (v is int) return v;
      // Firestore Timestamp: read millisecondsSinceEpoch by duck-typing so this
      // model stays free of a hard cloud_firestore import.
      try {
        final n = (v as dynamic).millisecondsSinceEpoch;
        if (n is int) return n;
      } catch (_) {/* not a Timestamp */}
      return null;
    }

    return Consultation(
      id: id,
      customerId: (m['customerId'] ?? '') as String,
      astrologerId: (m['astrologerId'] ?? '') as String,
      type: ConsultationType.fromString(m['type'] as String?),
      status: ConsultationStatus.fromString(m['status'] as String?),
      // Money/time fields are read via `as num).toInt()`, NOT `as int`: Firestore
      // can return an integer-valued field as a double (e.g. 900.0), and a bare
      // `as int` would throw INSIDE the live StreamProvider and crash the
      // consultation screen mid-session. (Same safe pattern already used for
      // `rating` below.)
      pricePerMinute: ((m['pricePerMinute'] ?? 900) as num).toInt(),
      billedSeconds: ((m['billedSeconds'] ?? 0) as num).toInt(),
      duration: ((m['duration'] ?? 0) as num).toInt(),
      totalCharged: ((m['totalCharged'] ?? 0) as num).toInt(),
      walletAfter: ((m['walletAfter'] ?? 0) as num).toInt(),
      remainingSec: ((m['remainingSec'] ?? 0) as num).toInt(),
      warnLevel: ((m['warnLevel'] ?? 0) as num).toInt(),
      networkStatus: (m['networkStatus'] ?? 'ok') as String,
      graceGranted: (m['graceGranted'] ?? false) as bool,
      agoraChannel: m['agoraChannel'] as String?,
      receiptNo: m['receiptNo'] as String?,
      rating: (m['rating'] as num?)?.toDouble(),
      review: m['review'] as String?,
      // Backend writes Firestore Timestamps `startTime`/`endTime`; fall back to
      // the *Ms integer names for any legacy/local doc that used them.
      startTimeMs: ms(m['startTime'] ?? m['startTimeMs']),
      endTimeMs: ms(m['endTime'] ?? m['endTimeMs']),
      requestedSkill: m['requestedSkill'] as String?,
    );
  }

  @override
  List<Object?> get props => [
        id, customerId, astrologerId, type, status, pricePerMinute, billedSeconds,
        duration, totalCharged, walletAfter, remainingSec, warnLevel, networkStatus,
        graceGranted, agoraChannel, receiptNo, rating, review, startTimeMs, endTimeMs,
        requestedSkill,
      ];
}
