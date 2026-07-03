import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../auth/auth_controller.dart';
import '../search/search_screen.dart';
import '../profile_setup/onboarding_style.dart';
import 'cms_viewer_screen.dart';
import 'support_screen.dart';

class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).valueOrNull;
    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            _header(context, profile),
            const SizedBox(height: 20),
            _label('ACCOUNT'),
            _card([
              _row(Icons.account_balance_wallet_rounded, 'My Wallet',
                  onTap: () => context.push('/recharge'),
                  trailing: _pill(Money.formatPaise(profile?.spendablePaise ?? 0))),
              _row(Icons.chat_bubble_outline_rounded, 'My Sessions',
                  onTap: () => _soon(context, 'My Sessions')),
              _row(Icons.favorite_border_rounded, 'My Favourites',
                  onTap: () => _soon(context, 'My Favourites')),
              _row(Icons.self_improvement_rounded, 'Suggested Remedies',
                  onTap: () => _soon(context, 'Suggested Remedies')),
            ]),
            _label('EXPLORE'),
            _card([
              _row(Icons.auto_awesome_rounded, 'Chat with an Astrologer',
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const SearchScreen()))),
              _row(Icons.live_tv_rounded, 'Live Session', onTap: () => _soon(context, 'Live Session')),
              _row(Icons.card_giftcard_rounded, 'Free Service',
                  onTap: () => _soon(context, 'Free Service'), badge: 'NEW'),
              if (profile != null)
                _row(Icons.redeem_rounded, 'Refer a Friend',
                    onTap: () => _referral(context, profile.referralCode)),
            ]),
            _label('SETTINGS'),
            _card([
              if (profile != null)
                _row(Icons.notifications_none_rounded, 'Notifications',
                    trailing: Switch(
                      value: profile.notificationEnabled,
                      activeTrackColor: Ob.purple,
                      onChanged: (v) => ref
                          .read(userRepositoryProvider)
                          .updateProfile(profile.id, {'notificationEnabled': v}),
                    )),
              _row(Icons.headset_mic_rounded, 'Help & Support',
                  onTap: () => _push(context, const SupportScreen())),
              _row(Icons.privacy_tip_outlined, 'Privacy Policy',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'privacy', title: 'Privacy Policy'))),
              _row(Icons.description_outlined, 'Terms of Service',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'terms', title: 'Terms of Service'))),
              _row(Icons.info_outline_rounded, 'About ASKTRO',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'about', title: 'About ASKTRO'))),
            ]),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => ref.read(authControllerProvider).signOut(),
              child: Container(
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Ob.border),
                  boxShadow: Ob.softShadow,
                ),
                child: Center(
                  child: Text('Log out',
                      style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Center(
              child: TextButton(
                onPressed: () => _confirmDelete(context, ref),
                child: Text('Delete account',
                    style: Ob.note.copyWith(color: const Color(0xFFD64545))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- header ----
  Widget _header(BuildContext context, UserProfile? profile) {
    final name = (profile?.name ?? '').trim();
    final initial = name.isEmpty ? '★' : name.substring(0, 1).toUpperCase();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8E6BD1), Color(0xFF5E3FBE)]),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [BoxShadow(color: const Color(0xFF5E3FBE).withValues(alpha: 0.28), blurRadius: 22, offset: const Offset(0, 12))],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 74,
                height: 74,
                decoration: BoxDecoration(
                  gradient: Ob.goldGradient,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 3),
                ),
                clipBehavior: Clip.antiAlias,
                child: (profile?.profilePhoto != null && profile!.profilePhoto!.isNotEmpty)
                    ? Image.network(profile.profilePhoto!, fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _initial(initial))
                    : _initial(initial),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name.isEmpty ? 'Your Profile' : name,
                        style: Ob.title.copyWith(color: Colors.white, fontSize: 25),
                        overflow: TextOverflow.ellipsis),
                    Text(profile?.phone ?? '', style: Ob.note.copyWith(color: const Color(0xFFE1D6F7))),
                  ],
                ),
              ),
              const Icon(Icons.edit_outlined, color: Colors.white, size: 20),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('WALLET BALANCE',
                        style: Ob.note.copyWith(color: const Color(0xFFEAD79A), fontSize: 10, letterSpacing: 1)),
                    Text(Money.formatPaise(profile?.spendablePaise ?? 0),
                        style: Ob.title.copyWith(color: Colors.white, fontSize: 22)),
                  ],
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.push('/recharge'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
                    child: Text('+ Add Money',
                        style: Ob.option.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _initial(String initial) => Center(
        child: Text(initial,
            style: Ob.title.copyWith(color: Colors.white, fontSize: 32)),
      );

  // ---- rows / cards ----
  Widget _label(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
        child: Text(text, style: Ob.note.copyWith(fontWeight: FontWeight.w600, letterSpacing: 1.5)),
      );

  Widget _card(List<Widget> rows) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22), boxShadow: Ob.softShadow),
        child: Column(children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1) const Divider(height: 1, indent: 64, endIndent: 16, color: Ob.border),
          ],
        ]),
      );

  Widget _row(IconData icon, String label, {VoidCallback? onTap, Widget? trailing, String? badge}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: Ob.purple, size: 19),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: Ob.option.copyWith(fontSize: 15))),
            if (badge != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(8)),
                child: Text(badge, style: Ob.note.copyWith(fontSize: 10, fontWeight: FontWeight.w700, color: Ob.navy)),
              ),
              const SizedBox(width: 8),
            ],
            if (trailing != null) trailing
            else const Icon(Icons.chevron_right_rounded, color: Color(0xFFB9B3C9)),
          ],
        ),
      ),
    );
  }

  Widget _pill(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: const Color(0xFFEAF7EF), borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: Ob.note.copyWith(color: const Color(0xFF2F9E5F), fontWeight: FontWeight.w700, fontSize: 12)),
      );

  // ---- actions ----
  void _push(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  void _soon(BuildContext context, String title) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(
            color: Ob.bgColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
              child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 30),
            ),
            const SizedBox(height: 16),
            Text(title, style: Ob.title, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text("This feature is on its way — check back soon ✦",
                style: Ob.subtitle, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  void _referral(BuildContext context, String code) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(
            color: Ob.bgColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Refer a Friend', style: Ob.title),
            const SizedBox(height: 8),
            Text('Share your code — you both get wallet credit when they recharge.',
                style: Ob.subtitle, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
              decoration: BoxDecoration(
                  color: Ob.lavenderChip, borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Ob.selectedBorder)),
              child: Text(code.isEmpty ? '—' : code,
                  style: Ob.title.copyWith(color: Ob.purpleDeep, letterSpacing: 2)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
            'This permanently removes your profile and data. Active consultations must be finished first.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFD64545)))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(functionsProvider).httpsCallable('deleteAccount').call();
      await ref.read(authControllerProvider).signOut();
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not delete account. Please try again.')));
      }
    }
  }
}
