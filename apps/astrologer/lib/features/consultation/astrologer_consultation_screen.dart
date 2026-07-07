import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_insight.dart';
import 'consultation_details_screen.dart';

/// The astrologer's live consultation screen. Accepts a waiting request
/// (activates the server session), then conducts the chat or call. Billing is
/// backend-driven; this screen sends the heartbeat while active and never shows
/// the customer's wallet — only session time + session earnings.
class AstrologerConsultationScreen extends ConsumerStatefulWidget {
  const AstrologerConsultationScreen({super.key, required this.consultationId, required this.self});
  final String consultationId;
  final Astrologer self;

  @override
  ConsumerState<AstrologerConsultationScreen> createState() => _State();
}

class _State extends ConsumerState<AstrologerConsultationScreen> {
  final _input = TextEditingController();
  Timer? _heartbeat;
  Timer? _uiTick;
  DateTime? _activeSince;
  bool _accepting = false;

  String get _id => widget.consultationId;

  @override
  void dispose() {
    _heartbeat?.cancel();
    _uiTick?.cancel();
    _input.dispose();
    super.dispose();
  }

  void _ensureHeartbeat(ConsultationStatus status) {
    if (status == ConsultationStatus.active) {
      _heartbeat ??= Timer.periodic(
          const Duration(seconds: 10), (_) => ref.read(consultationServiceProvider).tick(_id));
      // Local stopwatch drives a smooth 1-second countdown/timer in the header,
      // independent of the coarse (~10s) server billing ticks.
      _activeSince ??= DateTime.now();
      _uiTick ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else {
      _heartbeat?.cancel();
      _heartbeat = null;
      _uiTick?.cancel();
      _uiTick = null;
    }
  }

  /// Seconds since the session went active on this screen (0 if not started).
  int get _elapsedSeconds =>
      _activeSince == null ? 0 : DateTime.now().difference(_activeSince!).inSeconds;

  static String _mmss(int seconds) {
    final s = seconds < 0 ? 0 : seconds;
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  Future<void> _accept() async {
    setState(() => _accepting = true);
    final r = await ref.read(consultationServiceProvider).accept(_id);
    if (!mounted) return;
    setState(() => _accepting = false);
    r.when(
      success: (_) {},
      failure: (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
    );
  }

  Future<void> _decline() async {
    await ref.read(consultationServiceProvider).decline(_id);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _confirmEnd() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Sky.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('End consultation?', style: Sky.h2),
        content: Text('The session will close and the customer will be asked to rate you.', style: Sky.body.copyWith(fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text('Cancel', style: Sky.label)),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text('End', style: Sky.label.copyWith(color: Sky.red, fontWeight: FontWeight.w800))),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(consultationServiceProvider).end(_id);
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    await ref.read(firestoreProvider).collection('consultations').doc(_id).collection('messages').add({
      'senderId': widget.self.id,
      'type': 'text',
      'text': text,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (picked == null) return;
    final data = await picked.readAsBytes();
    final store = FirebaseStorage.instance.ref('chat_images/$_id/${DateTime.now().millisecondsSinceEpoch}.jpg');
    await store.putData(data, SettableMetadata(contentType: 'image/jpeg'));
    final url = await store.getDownloadURL();
    await ref.read(firestoreProvider).collection('consultations').doc(_id).collection('messages').add({
      'senderId': widget.self.id,
      'type': 'image',
      'image': url,
      'timestamp': FieldValue.serverTimestamp(),
      'delivered': true,
      'seen': false,
    });
  }

  void _openDetails(Consultation c) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConsultationDetailsScreen(consultation: c, self: widget.self),
    ));
  }

  Future<void> _quickNote(Consultation c) async {
    final current = await ref.read(astrologerRepositoryProvider).watchPrivateNote(widget.self.id, c.customerId).first;
    if (!mounted) return;
    final ctrl = TextEditingController(text: current);
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            left: 20, right: 20, top: 18, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.lock_rounded, size: 16, color: Sky.gold),
              const SizedBox(width: 7),
              Text('Private note', style: Sky.h2),
              const Spacer(),
              Text('Only you', style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              minLines: 3,
              maxLines: 6,
              autofocus: true,
              style: Sky.body,
              decoration: InputDecoration(
                hintText: 'Jot something for next time…',
                filled: true,
                fillColor: Sky.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 12),
            GoldButton(
              label: 'Save note',
              onPressed: () async {
                await ref.read(astrologerRepositoryProvider).savePrivateNote(widget.self.id, c.customerId, ctrl.text.trim());
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_sessionProvider(_id));
    return async.when(
      loading: () => const SkyScaffold(child: Center(child: CircularProgressIndicator(color: Sky.purple))),
      error: (_, __) => const SkyScaffold(child: ErrorStateView()),
      data: (c) {
        _ensureHeartbeat(c.status);
        if (c.status == ConsultationStatus.waiting) return _waitingView(c);
        if (c.status.isTerminal) return _summaryView(c);
        return c.type == ConsultationType.chat ? _chatView(c) : _callView(c);
      },
    );
  }

  // ---- waiting / incoming ----
  Widget _waitingView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final insight = CustomerInsight(cust);
    return SkyScaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            children: [
              const Spacer(),
              Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Sky.goldGrad),
                child: AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 96),
              ),
              const SizedBox(height: 16),
              Text(cust?.name ?? 'New customer', style: Sky.h1),
              const SizedBox(height: 6),
              Text(
                [
                  if (insight.age != null) '${insight.age} yrs',
                  if (insight.genderLabel != '—') insight.genderLabel,
                  if (insight.birthPlace != 'Not provided') insight.birthPlace,
                ].join('  ·  '),
                style: Sky.label.copyWith(fontSize: 13),
              ),
              const SizedBox(height: 14),
              Pill('Incoming ${c.type.name} request', color: Sky.gold, icon: typeIconLocal(c.type)),
              const Spacer(),
              GoldButton(label: 'Accept consultation', icon: Icons.check_rounded, loading: _accepting, onPressed: _accepting ? null : _accept),
              const SizedBox(height: 10),
              GhostButton(label: 'Decline', color: Sky.ink2, onPressed: _decline),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  // ---- live chat ----
  Widget _chatView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    return SkyScaffold(
      child: Column(
        children: [
          _liveHeader(c, cust, dark: false),
          _quickAccess(c),
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.auto_awesome_rounded, size: 40, color: Sky.ink3),
                      const SizedBox(height: 10),
                      Text('Consultation started', style: Sky.h2.copyWith(fontSize: 15)),
                      const SizedBox(height: 4),
                      Text('Send a message to begin.', style: Sky.label),
                    ]),
                  )
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(16),
                    itemCount: messages.length,
                    itemBuilder: (_, i) {
                      final m = messages[i];
                      final mine = m['senderId'] == widget.self.id;
                      final image = m['image'] as String?;
                      final hasImage = image != null && image.isNotEmpty;
                      return Align(
                        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: hasImage ? const EdgeInsets.all(4) : const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
                          decoration: BoxDecoration(
                            gradient: mine && !hasImage ? Sky.heroGrad : null,
                            color: mine ? null : Sky.card,
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(16),
                              topRight: const Radius.circular(16),
                              bottomLeft: Radius.circular(mine ? 16 : 4),
                              bottomRight: Radius.circular(mine ? 4 : 16),
                            ),
                            border: mine ? null : Border.all(color: Sky.line),
                          ),
                          child: hasImage
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(12),
                                  child: Image.network(image, fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined)),
                                )
                              : Text((m['text'] ?? '') as String,
                                  style: Sky.body.copyWith(fontSize: 14.5, color: mine ? Colors.white : Sky.ink)),
                        ),
                      );
                    },
                  ),
          ),
          if (widget.self.quickReplies.isNotEmpty)
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final q in widget.self.quickReplies)
                    Padding(
                      padding: const EdgeInsets.only(right: 8, top: 4, bottom: 4),
                      child: GestureDetector(
                        onTap: () {
                          _input.text = q;
                          _input.selection = TextSelection.collapsed(offset: q.length);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(999)),
                          child: Text(q, style: Sky.label.copyWith(fontSize: 12.5, color: Sky.purple)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          _composer(),
        ],
      ),
    );
  }

  Widget _liveHeader(Consultation c, UserProfile? cust, {required bool dark}) {
    final topPad = MediaQuery.of(context).padding.top;
    final fg = dark ? Colors.white : Sky.ink;
    return Container(
      padding: EdgeInsets.fromLTRB(10, topPad + 6, 12, 12),
      decoration: BoxDecoration(
        color: dark ? Colors.transparent : Sky.card,
        border: dark ? null : const Border(bottom: BorderSide(color: Sky.line)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: fg),
          ),
          AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 38),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cust?.name ?? 'Customer',
                    style: Sky.h2.copyWith(fontSize: 14.5, color: fg), maxLines: 1, overflow: TextOverflow.ellipsis),
                _headerTimerLine(c, dark),
              ],
            ),
          ),
          GestureDetector(
            onTap: _confirmEnd,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(color: Sky.red, borderRadius: BorderRadius.circular(12)),
              child: Text('End', style: Sky.label.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
            ),
          ),
        ],
      ),
    );
  }

  /// Header status line: a live session timer (counting up from when the
  /// session went active) with running earnings. The astrologer can't see the
  /// customer's wallet, so we never show a "free time" countdown here — that's a
  /// customer-side concept tied to their balance. Elapsed + earned is always
  /// accurate for the astrologer.
  Widget _headerTimerLine(Consultation c, bool dark) {
    return Row(
      children: [
        Icon(Icons.timer_outlined, size: 12.5, color: dark ? Colors.white70 : Sky.ink2),
        const SizedBox(width: 4),
        Text('${_mmss(_elapsedSeconds)}  ·  earned ${Money.formatPaise(widget.self.netOf(c.totalCharged))}',
            style: Sky.label.copyWith(fontSize: 11.5, color: dark ? Colors.white70 : Sky.ink2)),
      ],
    );
  }

  Widget _quickAccess(Consultation c) {
    Widget chip(IconData i, String label, VoidCallback onTap) => Expanded(
          child: GestureDetector(
            onTap: onTap,
            behavior: HitTestBehavior.opaque,
            child: Column(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(13)),
                  child: Icon(i, size: 19, color: Sky.purple),
                ),
                const SizedBox(height: 5),
                Text(label, style: Sky.label.copyWith(fontSize: 10.5)),
              ],
            ),
          ),
        );
    return Container(
      color: Sky.card,
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
      child: Row(
        children: [
          chip(Icons.person_rounded, 'Profile', () => _openDetails(c)),
          chip(Icons.auto_awesome_rounded, 'Kundli', () => _openDetails(c)),
          chip(Icons.lock_rounded, 'Notes', () => _quickNote(c)),
          chip(Icons.history_rounded, 'History', () => _openDetails(c)),
        ],
      ),
    );
  }

  Widget _composer() {
    final mq = MediaQuery.of(context);
    // When the keyboard is up, sit above it; when it's down, sit above the
    // Android gesture/navigation bar (the safe zone) — never under either.
    final bottomInset = mq.viewInsets.bottom > mq.padding.bottom ? mq.viewInsets.bottom : mq.padding.bottom;
    return Container(
      color: Sky.card,
      padding: EdgeInsets.only(left: 12, right: 8, top: 8, bottom: bottomInset + 10),
      child: Row(
        children: [
          IconButton(onPressed: _sendImage, icon: const Icon(Icons.image_outlined, color: Sky.ink2)),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
              decoration: BoxDecoration(color: Sky.surface, borderRadius: BorderRadius.circular(999)),
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                style: Sky.body,
                decoration: const InputDecoration(hintText: 'Type a reply…', border: InputBorder.none, isDense: true),
              ),
            ),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: _send,
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(gradient: Sky.heroGrad, shape: BoxShape.circle),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  // ---- voice / video (clean UI shell; real calling is staged) ----
  Widget _callView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final video = c.type == ConsultationType.video;
    return Scaffold(
      backgroundColor: Sky.purpleDeep,
      body: Stack(
        children: [
          const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: Sky.heroGrad))),
          const Positioned.fill(child: CelestialWash(opacity: 0.5)),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white24, width: 2)),
                  child: AppAvatar(name: cust?.name ?? 'Customer', photoUrl: cust?.profilePhoto, size: 108),
                ),
                const SizedBox(height: 16),
                Text(cust?.name ?? 'Customer', style: Sky.h1.copyWith(color: Colors.white, fontSize: 24)),
                const SizedBox(height: 8),
                Text('${video ? 'Video' : 'Voice'} · ${Money.formatDuration(c.billedSeconds)}',
                    style: Sky.body.copyWith(color: Colors.white70)),
                const SizedBox(height: 6),
                Text('Earned ${Money.formatPaise(widget.self.netOf(c.totalCharged))}',
                    style: Sky.label.copyWith(color: Sky.goldSoft, fontWeight: FontWeight.w700)),
                const Spacer(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _floatBtn(Icons.auto_awesome_rounded, 'Kundli', () => _openDetails(c)),
                    const SizedBox(width: 22),
                    _floatBtn(Icons.lock_rounded, 'Notes', () => _quickNote(c)),
                  ],
                ),
                const SizedBox(height: 22),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _callBtn(Icons.mic_rounded, Colors.white24, () {}),
                    const SizedBox(width: 16),
                    _callBtn(Icons.volume_up_rounded, Colors.white24, () {}),
                    if (video) ...[const SizedBox(width: 16), _callBtn(Icons.videocam_rounded, Colors.white24, () {})],
                    const SizedBox(width: 16),
                    _callBtn(Icons.call_end_rounded, Sky.red, _confirmEnd),
                  ],
                ),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _floatBtn(IconData icon, String label, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, color: Sky.goldSoft, size: 18),
              const SizedBox(width: 7),
              Text(label, style: Sky.label.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
            ]),
          ),
        ]),
      );

  Widget _callBtn(IconData icon, Color bg, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Icon(icon, color: Colors.white, size: 26),
        ),
      );

  // ---- summary ----
  Widget _summaryView(Consultation c) {
    return SkyScaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(color: Sky.green.withValues(alpha: 0.12), shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, size: 40, color: Sky.green),
              ),
              const SizedBox(height: 16),
              Text('Consultation complete', style: Sky.h1),
              const SizedBox(height: 20),
              SkyCard(
                child: Column(children: [
                  _row('Duration', Money.formatDurationLong(c.duration)),
                  _row('Type', c.type.name),
                  _row('Earned', Money.formatPaise(widget.self.netOf(c.totalCharged))),
                  if (c.receiptNo != null) _row('Receipt', c.receiptNo!),
                ]),
              ),
              const SizedBox(height: 22),
              GoldButton(label: 'Done', onPressed: () => Navigator.of(context).pop()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [Text(k, style: Sky.label.copyWith(fontSize: 13)), Text(v, style: Sky.h2.copyWith(fontSize: 14))],
        ),
      );
}

IconData typeIconLocal(ConsultationType t) {
  switch (t) {
    case ConsultationType.voice:
      return Icons.call_rounded;
    case ConsultationType.video:
      return Icons.videocam_rounded;
    case ConsultationType.chat:
      return Icons.chat_bubble_rounded;
  }
}

// ---- providers scoped to this screen ----
final _sessionProvider = StreamProvider.autoDispose
    .family<Consultation, String>((ref, id) => ref.watch(consultationServiceProvider).watch(id));

final _messagesProvider =
    StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(id)
      .collection('messages')
      .orderBy('timestamp', descending: true)
      .limit(200)
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());
});
