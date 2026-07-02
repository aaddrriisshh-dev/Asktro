import 'package:equatable/equatable.dart';

/// Customer profile. Money fields are display-only on the client.
class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    required this.name,
    this.phone = '',
    this.email,
    this.profilePhoto,
    this.walletBalance = 0,
    this.bonusBalance = 0,
    this.referralCode = '',
    this.referredBy,
    this.totalConsultations = 0,
    this.notificationEnabled = true,
    this.favouriteAstrologers = const [],
    this.followingAstrologers = const [],
    this.accountStatus = 'active',
  });

  final String id;
  final String name;
  final String phone;
  final String? email;
  final String? profilePhoto;
  final int walletBalance; // paise
  final int bonusBalance; // paise
  final String referralCode;
  final String? referredBy;
  final int totalConsultations;
  final bool notificationEnabled;
  final List<String> favouriteAstrologers;
  final List<String> followingAstrologers;
  final String accountStatus;

  int get spendablePaise => walletBalance + bonusBalance;

  factory UserProfile.fromMap(String id, Map<String, dynamic> m) => UserProfile(
        id: id,
        name: (m['name'] ?? '') as String,
        phone: (m['phone'] ?? '') as String,
        email: m['email'] as String?,
        profilePhoto: m['profilePhoto'] as String?,
        walletBalance: (m['walletBalance'] ?? 0) as int,
        bonusBalance: (m['bonusBalance'] ?? 0) as int,
        referralCode: (m['referralCode'] ?? '') as String,
        referredBy: m['referredBy'] as String?,
        totalConsultations: (m['totalConsultations'] ?? 0) as int,
        notificationEnabled: (m['notificationEnabled'] ?? true) as bool,
        favouriteAstrologers: List<String>.from(m['favouriteAstrologers'] ?? const []),
        followingAstrologers: List<String>.from(m['followingAstrologers'] ?? const []),
        accountStatus: (m['accountStatus'] ?? 'active') as String,
      );

  @override
  List<Object?> get props => [
        id, name, phone, email, profilePhoto, walletBalance, bonusBalance,
        referralCode, referredBy, totalConsultations, notificationEnabled,
        favouriteAstrologers, followingAstrologers, accountStatus,
      ];
}
