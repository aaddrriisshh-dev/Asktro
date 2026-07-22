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
    return RailBand(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 4, 12, 10),
            child: Row(
              children: [
                const Icon(Icons.auto_stories_rounded, size: 17, color: Ob.gold),
                const SizedBox(width: 7),
                Expanded(child: Text('Continue your reading', style: Ob.title.copyWith(fontSize: 19))),
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
      ),
    );
  }
}

/// Wraps a home rail in a floating white card on the cream page — the clearest,
/// most premium separation between sections. Living inside each rail means a
/// hidden (empty) rail shows no card at all.
class RailBand extends StatelessWidget {
  const RailBand({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Ob.border),
        boxShadow: Ob.softShadow,
      ),
      child: child,
    );
  }
}

class _ContinueCard extends ConsumerWidget {
  const _ContinueCard({required this.c});
  final Consultation c;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final astro = ref.watch(_railAstrologerProvider(c.astrologerId)).valueOrNull;
    final name = astro?.name ?? 'Astrologer';
    // Server-denormalized preview + unread (onChatMessageNudge) — no per-chat
    // listener. "You: …" when the last line was the customer's own.
    final lastAt = c.lastMessageAtMs != null
        ? DateTime.fromMillisecondsSinceEpoch(c.lastMessageAtMs!)
        : null;
    final preview = (c.lastMessageText != null && c.lastMessageText!.isNotEmpty)
        ? (c.lastMessageFromCustomer ? 'You: ${c.lastMessageText}' : c.lastMessageText!)
        : (c.status.isOpen ? 'Tap to resume' : 'Tap to open');
    final unread = c.customerUnread;

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
                      Text(_ago(lastAt),
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
                          child: Text(unread > 9 ? '9+' : '$unread',
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
