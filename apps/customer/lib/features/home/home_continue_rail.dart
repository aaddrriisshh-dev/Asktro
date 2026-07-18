import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../consultation/chat_consultation_screen.dart';
import '../consultations/consultations_tab.dart' show ConsultationsTab;
import '../profile_setup/onboarding_style.dart';

/// The customer's recent CHAT consultations (any astrologer, AI or human),
/// newest first. Voice/video are excluded — "continue reading" is about chats.
/// Filtered client-side so no composite index is needed.
final _recentChatsProvider = StreamProvider.autoDispose<List<Consultation>>((ref) {
  final uid = ref.watch(currentUidProvider);
  final db = ref.watch(firestoreProvider);
  if (uid == null) return const Stream.empty();
  return db
      .collection('consultations')
      .where('customerId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(30)
      .snapshots()
      .map((s) => s.docs
          .map((d) => Consultation.fromMap(d.id, d.data()))
          .where((c) => c.type == ConsultationType.chat)
          .take(8)
          .toList());
});

/// Last message + unread count for one chat, from the last 30 messages only
/// (bounded). Mirrors the astrologer app's inbox summary.
class _ChatSummary {
  const _ChatSummary({this.lastText, this.unread = 0, this.lastAt});
  final String? lastText;
  final int unread;
  final DateTime? lastAt;
}

final _chatSummaryProvider =
    StreamProvider.autoDispose.family<_ChatSummary, ({String cid, String uid})>((ref, a) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(a.cid)
      .collection('messages')
      .orderBy('timestamp', descending: true)
      .limit(30)
      .snapshots()
      .map((snap) {
    String? lastText;
    DateTime? lastAt;
    var unread = 0;
    for (final d in snap.docs) {
      final m = d.data();
      final mine = m['senderId'] == a.uid;
      if (lastText == null) {
        final body = m['type'] == 'image'
            ? '📷 Photo'
            : (m['type'] == 'remedy' ? '🪔 Remedy' : ((m['text'] ?? '') as String));
        lastText = mine ? 'You: $body' : body;
        final ts = m['timestamp'];
        if (ts is Timestamp) lastAt = ts.toDate();
      }
      if (!mine && m['seen'] != true) unread++;
    }
    return _ChatSummary(lastText: lastText, unread: unread, lastAt: lastAt);
  });
});

/// The astrologer behind a chat (name/photo/AI), resolved once per id.
final _railAstrologerProvider =
    FutureProvider.autoDispose.family<Astrologer?, String>((ref, id) async {
  try {
    return await ref.watch(astrologerRepositoryProvider).watchOne(id).first;
  } catch (_) {
    return null;
  }
});

String _ago(DateTime? t) {
  if (t == null) return '';
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return 'now';
  if (d.inMinutes < 60) return '${d.inMinutes}m';
  if (d.inHours < 24) return '${d.inHours}h';
  if (d.inDays < 7) return '${d.inDays}d';
  return '${(d.inDays / 7).floor()}w';
}

/// "Continue your reading" — a horizontal rail of the user's recent chats, each
/// with the astrologer's face, a last-message preview, and one-tap re-entry.
/// Hidden entirely when the user has no chats.
class ContinueRail extends ConsumerWidget {
  const ContinueRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(_recentChatsProvider).valueOrNull ?? const <Consultation>[];
    if (chats.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 22, 12, 10),
          child: Row(
            children: [
              const Icon(Icons.auto_stories_rounded, size: 17, color: Ob.gold),
              const SizedBox(width: 7),
              Expanded(child: Text('Continue your reading', style: Ob.title.copyWith(fontSize: 20))),
              GestureDetector(
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const ConsultationsTab())),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Text('View all  →',
                      style: Ob.option.copyWith(color: Ob.purple, fontWeight: FontWeight.w700, fontSize: 13)),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 92,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: chats.length,
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.only(right: 10),
              child: _ContinueCard(c: chats[i]),
            ),
          ),
        ),
      ],
    );
  }
}

class _ContinueCard extends ConsumerWidget {
  const _ContinueCard({required this.c});
  final Consultation c;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider) ?? '';
    final astro = ref.watch(_railAstrologerProvider(c.astrologerId)).valueOrNull;
    final summary = ref.watch(_chatSummaryProvider((cid: c.id, uid: uid))).valueOrNull;
    final name = astro?.name ?? 'Astrologer';
    final preview = summary?.lastText ?? (c.status.isOpen ? 'Tap to resume' : 'Tap to open');
    final unread = summary?.unread ?? 0;

    void open() {
      if (astro == null) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ChatConsultationScreen(
          consultationId: c.id,
          astrologer: astro,
          readOnly: c.status.isTerminal,
        ),
      ));
    }

    return GestureDetector(
      onTap: astro == null ? null : open,
      child: Container(
        width: 244,
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Ob.border),
          boxShadow: Ob.softShadow,
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AppAvatar(name: name, photoUrl: astro?.profilePhoto, size: 48),
                if (astro?.isOnline ?? false)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: AppColors.online,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(name,
                            style: Ob.option.copyWith(fontWeight: FontWeight.w800, fontSize: 13.5),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 5),
                      Text(_ago(summary?.lastAt),
                          style: Ob.note.copyWith(fontSize: 10.5, color: Ob.navy.withValues(alpha: 0.5))),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(preview,
                            style: Ob.note.copyWith(
                                fontSize: 12,
                                color: unread > 0 ? Ob.navy : Ob.navy.withValues(alpha: 0.6),
                                fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w400),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      if (unread > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          constraints: const BoxConstraints(minWidth: 18),
                          decoration: const BoxDecoration(color: Ob.purple, shape: BoxShape.rectangle,
                              borderRadius: BorderRadius.all(Radius.circular(999))),
                          child: Text('$unread',
                              textAlign: TextAlign.center,
                              style: Ob.note.copyWith(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(c.status.isOpen ? 'Resume' : 'View chat',
                      style: Ob.note.copyWith(
                          fontSize: 11,
                          color: c.status.isOpen ? AppColors.success : Ob.purple,
                          fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
