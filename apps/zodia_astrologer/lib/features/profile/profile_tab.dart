import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  /// In-app account deletion (Play requirement). Calls the astrologer-safe
  /// backend deletion, which blocks on an active consultation or unpaid earnings
  /// and otherwise erases PII + auth, retaining the anonymised earnings ledger.
  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Sky.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Delete account?', style: Sky.h2),
        content: const Text(
          'This permanently deletes your astrologer profile and personal data. '
          'Your earnings ledger and past consultation records are kept in '
          'anonymised form as required by law.\n\nYou must finish any active '
          'consultation and withdraw all pending earnings first.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: Sky.label)),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Delete', style: Sky.label.copyWith(color: Sky.red, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(functionsProvider).httpsCallable('deleteAstrologerAccount').call();
      await ref.read(firebaseAuthProvider).signOut();
    } on FirebaseFunctionsException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not delete account.')),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete account. Please try again.')),
        );
      }
    }
  }

  Future<void> _editText(BuildContext context, WidgetRef ref, Astrologer self,
      {required String title, required String field, required String initial, String? hint, int maxLines = 5,}) async {
    final c = TextEditingController(text: initial);
    final result = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Sky.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(title, style: Sky.h2),
        content: TextField(
          controller: c,
          maxLines: maxLines,
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: Sky.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancel', style: Sky.label)),
          TextButton(
              onPressed: () => Navigator.pop(context, c.text),
              child: Text('Save', style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w800)),),
        ],
      ),
    );
    if (result != null) {
      Map<String, dynamic> patch;
      if (field == 'quickReplies') {
        patch = {'quickReplies': result.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList()};
      } else if (field == 'payoutUpi') {
        // Kept inside the availability map so it round-trips through self.availability.
        patch = {'availability': {...self.availability, 'payoutUpi': result.trim()}};
      } else {
        patch = {field: result.trim()};
      }
      await ref.read(astrologerRepositoryProvider).updateProfile(self.id, patch);
    }
  }

  Future<void> _editAvailability(BuildContext context, WidgetRef ref, Astrologer self) async {
    bool holiday = self.availability['holiday'] == true;
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          backgroundColor: Sky.card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text('Availability', style: Sky.h2),
          content: SwitchListTile(
            value: holiday,
            activeThumbColor: Sky.purple,
            contentPadding: EdgeInsets.zero,
            title: Text('Holiday mode', style: Sky.body),
            subtitle: Text('Go offline and stop receiving requests.', style: Sky.label.copyWith(fontSize: 12)),
            onChanged: (v) => setState(() => holiday = v),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancel', style: Sky.label)),
            TextButton(
                onPressed: () => Navigator.pop(context, holiday),
                child: Text('Save', style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w800)),),
          ],
        ),
      ),
    );
    if (result != null) {
      await ref.read(astrologerRepositoryProvider).updateProfile(self.id, {
        'availability': {...self.availability, 'holiday': result},
        if (result) 'onlineStatus': false,
      });
    }
  }

  Future<void> _raiseTicket(BuildContext context, WidgetRef ref, Astrologer self) async {
    final c = TextEditingController();
    final msg = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Sky.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Help & Support', style: Sky.h2),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Describe your issue and the Zodia team will get back to you.',
                style: Sky.label.copyWith(fontSize: 12.5),),
            const SizedBox(height: 12),
            TextField(
              controller: c,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Your message…',
                filled: true,
                fillColor: Sky.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancel', style: Sky.label)),
          TextButton(
              onPressed: () => Navigator.pop(context, c.text.trim()),
              child: Text('Send', style: Sky.label.copyWith(color: Sky.purple, fontWeight: FontWeight.w800)),),
        ],
      ),
    );
    if (msg == null || msg.isEmpty) return;
    await ref.read(firestoreProvider).collection('supportTickets').add({
      'astrologerId': self.id,
      'raisedByName': self.name,
      'subject': 'Astrologer support',
      'lastMessage': msg,
      'status': 'open',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Ticket raised — we'll get back to you soon.")),);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final self = ref.watch(selfProvider).valueOrNull;
    if (self == null) {
      return const SkyScaffold(child: Center(child: CircularProgressIndicator(color: Sky.purple)));
    }
    final holiday = self.availability['holiday'] == true;
    final upi = (self.availability['payoutUpi'] as String?)?.trim();

    return SkyScaffold(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          _header(context, self),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 34),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // (The self-written "About" section was removed — an astrologer's
                // public bio is curated in the admin portal, not self-edited here.)
                if (self.languages.isNotEmpty) ...[
                  Text('Languages', style: Sky.h2.copyWith(fontSize: 15)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 7, runSpacing: 7, children: [for (final l in self.languages) Pill(l, color: Sky.purple)]),
                ],
                if (self.expertise.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text('Specializations', style: Sky.h2.copyWith(fontSize: 15)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 7, runSpacing: 7, children: [for (final e in self.expertise) Pill(e, color: Sky.gold)]),
                ],
                const SizedBox(height: 22),
                _tile(Icons.quickreply_rounded, 'Quick replies', '${self.quickReplies.length} saved',
                    onTap: () => _editText(context, ref, self,
                        title: 'Quick replies',
                        field: 'quickReplies',
                        initial: self.quickReplies.join('\n'),
                        hint: 'One reply per line',
                        maxLines: 8,),),
                _tile(Icons.schedule_rounded, 'Availability', holiday ? 'Holiday mode' : 'Active',
                    valueColor: holiday ? Sky.amber : Sky.green,
                    onTap: () => _editAvailability(context, ref, self),),
                _tile(Icons.account_balance_rounded, 'Bank / UPI details', (upi == null || upi.isEmpty) ? 'Add UPI' : upi,
                    onTap: () => _editText(context, ref, self,
                        title: 'Payout UPI',
                        field: 'payoutUpi',
                        initial: upi ?? '',
                        hint: 'name@bank',
                        maxLines: 1,),),
                _tile(Icons.verified_user_rounded, 'Verification',
                    self.verified ? 'Verified' : self.status.name,
                    valueColor: self.verified ? Sky.green : Sky.amber,),
                _tile(Icons.account_balance_wallet_rounded, 'Payouts & earnings', 'In Wallet',
                    onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Open the Wallet tab to see earnings and request a withdrawal.'),),),),
                _tile(Icons.headset_mic_rounded, 'Help & Support', 'Raise a ticket',
                    onTap: () => _raiseTicket(context, ref, self),),
                const SizedBox(height: 20),
                GhostButton(
                  label: 'Log out',
                  icon: Icons.logout_rounded,
                  color: Sky.red,
                  onPressed: () => ref.read(firebaseAuthProvider).signOut(),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  icon: const Icon(Icons.delete_forever_rounded, size: 18, color: Sky.red),
                  label: const Text('Delete account', style: TextStyle(color: Sky.red)),
                  onPressed: () => _deleteAccount(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, Astrologer self) {
    final topPad = MediaQuery.of(context).padding.top;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        gradient: Sky.heroGrad,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: CelestialWash()),
          Padding(
            padding: EdgeInsets.fromLTRB(20, topPad + 18, 20, 24),
            // Full width so the centered column actually centres across the
            // whole banner instead of hugging its widest child on the left.
            child: SizedBox(
              width: double.infinity,
              child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Sky.goldGrad),
                  child: AppAvatar(name: self.name, photoUrl: self.profilePhoto, size: 88),
                ),
                const SizedBox(height: 12),
                if (self.verified)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(gradient: Sky.goldGrad, borderRadius: BorderRadius.circular(999)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.verified_rounded, size: 13, color: Sky.purpleDeep),
                        const SizedBox(width: 5),
                        Text('ZODIA VERIFIED',
                            style: Sky.label.copyWith(color: Sky.purpleDeep, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.5),),
                      ],
                    ),
                  ),
                const SizedBox(height: 10),
                Text(self.name, style: Sky.h1.copyWith(color: Colors.white, fontSize: 22)),
                const SizedBox(height: 4),
                Text('${self.experience}y experience  ·  ${self.rating.toStringAsFixed(1)}★  ·  ${self.totalConsultations} sessions',
                    style: Sky.label.copyWith(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),),
              ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String title, String value, {VoidCallback? onTap, Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SkyCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: Sky.purple.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, size: 18, color: Sky.purple),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(title, style: Sky.h2.copyWith(fontSize: 14.5))),
            if (value.isNotEmpty)
              Text(value,
                  style: Sky.label.copyWith(fontSize: 12.5, color: valueColor ?? Sky.ink2, fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right_rounded, size: 18, color: Sky.ink3),
          ],
        ),
      ),
    );
  }
}
