import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../app/providers.dart';
import '../profile_setup/onboarding_style.dart';
import 'match_report_view.dart';

/// Lists every Kundali Match report the user has purchased, newest first, and
/// re-opens the full report (view + re-download + share) on tap. Reads the
/// user's own cached copies at users/{uid}/astro/match_*.
class PreviousMatchesScreen extends ConsumerWidget {
  const PreviousMatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider);
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Ob.navy,
        title: Text('Previous Match Reports',
            style: GoogleFonts.cormorantGaramond(fontSize: 23, fontWeight: FontWeight.w700, color: Ob.navy),),
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Ob.bgColor, Color(0xFFEDE6FB)],
          ),
        ),
        child: SafeArea(
          top: false,
          child: uid == null
              ? _empty('Sign in to see your saved reports.')
              : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection('users')
                      .doc(uid)
                      .collection('astro')
                      .snapshots(),
                  builder: (context, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final docs = (snap.data?.docs ?? [])
                        .where((d) => d.id.startsWith('match_'))
                        .toList()
                      ..sort((a, b) {
                        final ta = (a.data()['purchasedAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
                        final tb = (b.data()['purchasedAt'] as Timestamp?)?.millisecondsSinceEpoch ?? 0;
                        return tb.compareTo(ta);
                      });
                    if (docs.isEmpty) {
                      return _empty('No match reports yet.\nYour purchased reports will appear here.');
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                      itemCount: docs.length,
                      itemBuilder: (context, i) => _tile(context, docs[i].data()),
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                    );
                  },
                ),
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, Map<String, dynamic> m) {
    final data = (m['data'] is Map) ? Map<String, dynamic>.from(m['data'] as Map) : <String, dynamic>{};
    final gm = data['guna_milan'] is Map ? Map<String, dynamic>.from(data['guna_milan'] as Map) : null;
    final total = ((m['totalPoints'] ?? gm?['total_points']) as num?)?.toDouble() ?? 0;
    final max = ((m['maxPoints'] ?? gm?['maximum_points']) as num?)?.toDouble() ?? 36;
    final self = (m['selfName'] as String?)?.trim();
    final partner = (m['partnerName'] as String?)?.trim();
    final title = [
      (self == null || self.isEmpty) ? 'You' : self,
      (partner == null || partner.isEmpty) ? 'Partner' : partner,
    ].join('  ✦  ');
    final when = (m['purchasedAt'] as Timestamp?)?.toDate();
    final tStr = total == total.roundToDouble() ? total.toStringAsFixed(0) : total.toStringAsFixed(1);
    final good = max > 0 && total / max >= 0.5;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => MatchReportScreen(
            data: data,
            selfName: self ?? '',
            partnerName: partner ?? '',
          ),
        ),),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Ob.border),
            boxShadow: Ob.softShadow,
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF5E3FBE), Color(0xFF7E57C2)]),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(tStr, style: GoogleFonts.cormorantGaramond(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white, height: 1)),
                    Text('/${max.toStringAsFixed(0)}', style: Ob.note.copyWith(color: Colors.white70, fontSize: 9)),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Ob.option.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text(
                      '${good ? 'Good match' : 'Guna Milan'} · $tStr/${max.toStringAsFixed(0)} gunas'
                      '${when != null ? ' · ${DateFormat('d MMM yyyy').format(when)}' : ''}',
                      style: Ob.note.copyWith(color: Ob.grey),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Ob.grey),
            ],
          ),
        ),
      ),
    );
  }

  Widget _empty(String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.favorite_border_rounded, size: 44, color: Ob.grey),
              const SizedBox(height: 14),
              Text(text, textAlign: TextAlign.center, style: Ob.subtitle.copyWith(color: Ob.grey, height: 1.5)),
            ],
          ),
        ),
      );
}
