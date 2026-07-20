import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../auth/auth_controller.dart';
import '../consultations/consultations_tab.dart';
import '../wallet/transactions_screen.dart';
import '../search/search_screen.dart';
import '../tools/horoscope_screen.dart';
import '../tools/janam_kundli_screen.dart';
import '../tools/panchang_screen.dart';
import '../tools/auspicious_timings_screen.dart';
import '../profile_setup/onboarding_style.dart';
import 'cms_viewer_screen.dart';
import 'edit_profile_screen.dart';
import 'favourites_screen.dart';
import 'suggested_remedies_screen.dart';
import 'support_screen.dart';

/// Where "Share invite" points people. Replace with the live Play Store URL
/// once the app is published (tracked in docs/PRE_LAUNCH.md).
const _kAppDownloadLink = 'https://asktro.app';

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
                  trailing: _pill(Money.formatPaise(profile?.spendablePaise ?? 0)),),
              _row(Icons.receipt_long_rounded, 'Transactions',
                  onTap: () => _push(context, const TransactionsScreen()),),
              _row(Icons.chat_bubble_outline_rounded, 'My Sessions',
                  onTap: () => _push(context, const ConsultationsTab()),),
              _row(Icons.favorite_border_rounded, 'My Favourites',
                  onTap: () => _push(context, const FavouritesScreen()),),
              _row(Icons.self_improvement_rounded, 'Suggested Remedies',
                  onTap: () => _push(context, const SuggestedRemediesScreen()),),
            ]),
            _label('EXPLORE'),
            _card([
              _row(Icons.auto_awesome_rounded, 'Chat with an Astrologer',
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const SearchScreen())),),
              _row(Icons.live_tv_rounded, 'Live Session', onTap: () => _soon(context, 'Live Session')),
              _row(Icons.card_giftcard_rounded, 'Free Service',
                  onTap: () => _freeService(context), badge: 'NEW',),
              if (profile != null)
                _row(Icons.redeem_rounded, 'Refer a Friend or Family',
                    onTap: () => _referral(context, profile.referralCode),),
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
                    ),),
              _row(Icons.shopping_bag_outlined, 'My Orders',
                  onTap: () => context.push('/store/orders'),),
              _row(Icons.headset_mic_rounded, 'Help & Support',
                  onTap: () => _push(context, const SupportScreen()),),
              _row(Icons.privacy_tip_outlined, 'Privacy Policy',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'privacy', title: 'Privacy Policy')),),
              _row(Icons.description_outlined, 'Terms of Service',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'terms', title: 'Terms of Service')),),
              _row(Icons.gpp_maybe_outlined, 'Disclaimer',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'disclaimer', title: 'Disclaimer')),),
              _row(Icons.info_outline_rounded, 'About ASKTRO',
                  onTap: () => _push(context, const CmsViewerScreen(page: 'about', title: 'About ASKTRO')),),
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
                      style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w600),),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Center(
              child: TextButton(
                onPressed: () => _confirmDelete(context, ref),
                child: Text('Delete account',
                    style: Ob.note.copyWith(color: const Color(0xFFD64545)),),
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
            begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8E6BD1), Color(0xFF5E3FBE)],),
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
                    ? CachedNetworkImage(imageUrl: profile.profilePhoto!, fit: BoxFit.cover,
                        memCacheWidth: 220,
                        errorWidget: (_, __, ___) => _initial(initial),)
                    : _initial(initial),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name.isEmpty ? 'Your Profile' : name,
                        style: Ob.title.copyWith(color: Colors.white, fontSize: 25),
                        overflow: TextOverflow.ellipsis,),
                    Text(profile?.phone ?? '', style: Ob.note.copyWith(color: const Color(0xFFE1D6F7))),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const EditProfileScreen())),
                behavior: HitTestBehavior.opaque,
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.edit_outlined, color: Colors.white, size: 20),
                ),
              ),
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
                        style: Ob.note.copyWith(color: const Color(0xFFEAD79A), fontSize: 10, letterSpacing: 1),),
                    Text(Money.formatPaise(profile?.spendablePaise ?? 0),
                        style: Ob.title.copyWith(color: Colors.white, fontSize: 22),),
                  ],
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.push('/recharge'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(12)),
                    child: Text('+ Add Money',
                        style: Ob.option.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600),),
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
            style: Ob.title.copyWith(color: Colors.white, fontSize: 32),),
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
        ],),
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
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
            color: Ob.bgColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28)),),
        padding: EdgeInsets.fromLTRB(24, 22, 24, 34 + MediaQuery.of(ctx).padding.bottom),
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
                style: Ob.subtitle, textAlign: TextAlign.center,),
          ],
        ),
      ),
    );
  }

  void _referral(BuildContext context, String code) {
    final shareText = code.isEmpty
        ? 'Join me on ASKTRO — talk to expert astrologers. Download: $_kAppDownloadLink'
        : 'Join me on ASKTRO — talk to expert astrologers! Use my code $code when you sign up, and we BOTH get ₹20 wallet credit after your first recharge.\n\nDownload: $_kAppDownloadLink';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
            color: Ob.bgColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28)),),
        padding: EdgeInsets.fromLTRB(24, 22, 24, 34 + MediaQuery.of(ctx).padding.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(gradient: Ob.goldCircle, shape: BoxShape.circle),
              child: const Icon(Icons.redeem_rounded, color: Colors.white, size: 30),
            ),
            const SizedBox(height: 14),
            Text('Refer a Friend or Family', style: Ob.title, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Share your code. When they sign up and make their first recharge, you BOTH get ₹20 wallet credit.',
                style: Ob.subtitle, textAlign: TextAlign.center,),
            const SizedBox(height: 18),
            GestureDetector(
              onTap: () {
                Clipboard.setData(ClipboardData(text: code));
                ScaffoldMessenger.of(context)
                    .showSnackBar(const SnackBar(content: Text('Referral code copied')));
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                decoration: BoxDecoration(
                    color: Ob.lavenderChip,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Ob.selectedBorder),),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(code.isEmpty ? '—' : code,
                        style: Ob.title.copyWith(color: Ob.purpleDeep, letterSpacing: 2),),
                    const SizedBox(width: 10),
                    const Icon(Icons.copy_rounded, size: 18, color: Ob.purple),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                    backgroundColor: Ob.purple, padding: const EdgeInsets.symmetric(vertical: 14),),
                onPressed: () => Share.share(shareText, subject: 'Join me on ASKTRO'),
                icon: const Icon(Icons.share_rounded, size: 18),
                label: const Text('Share invite'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _freeService(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
            color: Ob.bgColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28)),),
        padding: EdgeInsets.fromLTRB(20, 20, 20, 34 + MediaQuery.of(ctx).padding.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Free Services', style: Ob.title),
            const SizedBox(height: 4),
            Text('Complimentary tools, on us.', style: Ob.subtitle),
            const SizedBox(height: 16),
            _freeTile(Icons.wb_sunny_rounded, 'Daily Horoscope', "Your sign's reading for today", () {
              Navigator.pop(context);
              _push(context, const HoroscopeScreen());
            }),
            const SizedBox(height: 10),
            _freeTile(Icons.brightness_5_rounded, 'Janam Kundli', 'Your birth chart, instantly', () {
              Navigator.pop(context);
              _push(context, const JanamKundliScreen());
            }),
            const SizedBox(height: 10),
            _freeTile(Icons.calendar_month_rounded, 'Panchang', "Today's tithi, nakshatra & yoga", () {
              Navigator.pop(context);
              _push(context, const PanchangScreen());
            }),
            const SizedBox(height: 10),
            _freeTile(Icons.schedule_rounded, 'Auspicious Timings', 'Rahu kaal & shubh muhurat today', () {
              Navigator.pop(context);
              _push(context, const AuspiciousTimingsScreen());
            }),
          ],
        ),
      ),
    );
  }

  Widget _freeTile(IconData icon, String title, String subtitle, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: Ob.softShadow,),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: Ob.lavenderChip, borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: Ob.purple),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Ob.option.copyWith(fontWeight: FontWeight.w700)),
                    Text(subtitle, style: Ob.note),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFFB9B3C9)),
            ],
          ),
        ),
      );

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final user = FirebaseAuth.instance.currentUser;
    // Only email/password accounts can (and must) re-enter a password. Phone and
    // Google/Apple accounts have no password — for them typing DELETE is the gate.
    final needsPassword = user?.providerData.any((p) => p.providerId == 'password') ?? false;

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setLocal) {
          final typedDelete = confirmCtrl.text.trim().toUpperCase() == 'DELETE';
          final canDelete = typedDelete && (!needsPassword || passwordCtrl.text.isNotEmpty);
          return AlertDialog(
            title: const Text('Delete account?'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                    'This permanently erases your profile, chats, photos and personal data. Payment records are kept in anonymised form as required by law. Active consultations must be finished first.',),
                const SizedBox(height: 16),
                const Text('Type DELETE to confirm',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),),
                const SizedBox(height: 6),
                TextField(
                  controller: confirmCtrl,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (_) => setLocal(() {}),
                  decoration: const InputDecoration(
                      hintText: 'DELETE', isDense: true, border: OutlineInputBorder(),),
                ),
                if (needsPassword) ...[
                  const SizedBox(height: 12),
                  const Text('Enter your password',
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),),
                  const SizedBox(height: 6),
                  TextField(
                    controller: passwordCtrl,
                    obscureText: true,
                    onChanged: (_) => setLocal(() {}),
                    decoration: const InputDecoration(
                        hintText: 'Password', isDense: true, border: OutlineInputBorder(),),
                  ),
                ],
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              TextButton(
                onPressed: canDelete ? () => Navigator.pop(ctx, true) : null,
                child: const Text('Delete', style: TextStyle(color: Color(0xFFD64545))),
              ),
            ],
          );
        },
      ),
    );
    if (ok != true) return;
    try {
      // Re-authenticate password users right before this destructive action.
      if (needsPassword && user?.email != null) {
        final cred = EmailAuthProvider.credential(email: user!.email!, password: passwordCtrl.text);
        await user.reauthenticateWithCredential(cred);
      }
      await ref.read(functionsProvider).httpsCallable('deleteAccount').call();
      await ref.read(authControllerProvider).signOut();
    } catch (e) {
      if (context.mounted) {
        final msg = e is FirebaseAuthException &&
                (e.code == 'wrong-password' || e.code == 'invalid-credential')
            ? 'Incorrect password. Please try again.'
            : 'Could not delete account. Please try again.';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    }
  }
}
