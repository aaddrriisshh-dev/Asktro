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
    this.status = AstrologerStatus.pending,
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
  final AstrologerStatus status;

  bool get isConsultable => onlineStatus && available && status == AstrologerStatus.approved;

  factory Astrologer.fromMap(String id, Map<String, dynamic> m) {
    return Astrologer(
      id: id,
      name: (m['name'] ?? '') as String,
      profilePhoto: m['profilePhoto'] as String?,
      about: (m['about'] ?? '') as String,
      experience: (m['experience'] ?? 0) as int,
      languages: List<String>.from(m['languages'] ?? const []),
      expertise: List<String>.from(m['expertise'] ?? const []),
      rating: ((m['rating'] ?? 0) as num).toDouble(),
      totalReviews: (m['totalReviews'] ?? 0) as int,
      totalConsultations: (m['totalConsultations'] ?? 0) as int,
      followers: (m['followers'] ?? 0) as int,
      responseTimeSec: (m['responseTimeSec'] ?? 0) as int,
      onlineStatus: (m['onlineStatus'] ?? false) as bool,
      available: (m['available'] ?? false) as bool,
      verified: (m['verified'] ?? false) as bool,
      featured: (m['featured'] ?? false) as bool,
      status: AstrologerStatus.fromString(m['accountStatus'] as String?),
    );
  }

  @override
  List<Object?> get props => [
        id, name, profilePhoto, about, experience, languages, expertise, rating,
        totalReviews, totalConsultations, followers, responseTimeSec,
        onlineStatus, available, verified, featured, status,
      ];
}
