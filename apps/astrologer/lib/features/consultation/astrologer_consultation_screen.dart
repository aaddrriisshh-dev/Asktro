import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';
import '../../ui/customer_details_card.dart';
import '../moderation/moderation_actions.dart';
import 'consultation_details_screen.dart';

/// The astrologer's live consultation screen. Accepts a waiting request
/// (activates the server session), then conducts the chat or call. Billing is
/// backend-driven; this screen sends the heartbeat while active and never shows
/// the customer's wallet — only session time + session earnings.
class AstrologerConsultationScreen extends ConsumerStatefulWidget {
  const AstrologerConsultationScreen({
    super.key,
    required this.consultationId,
    required this.self,
    this.autoJoinCall = false,
  });
  final String consultationId;
  final Astrologer self;

  /// Set when opened straight from the incoming-call ring: the astrologer has
  /// already tapped Accept, so jump into the call view and join audio without
  /// showing the waiting screen. Billing still waits for the audio to connect.
  final bool autoJoinCall;

  @override
  ConsumerState<AstrologerConsultationScreen> createState() => _State();
}

class _State extends ConsumerState<AstrologerConsultationScreen> {
  final _input = TextEditingController();
  Timer? _heartbeat;
  Timer? _uiTick;
  DateTime? _activeSince;
  bool _accepting = false;

  // Voice/video media session (null for chats). Joined once the astrologer
  // accepts the call; billing (activate) is deferred until the audio connects.
  CallEngine? _call;
  bool _callJoinStarted = false;
  bool _acceptedCall = false; // astrologer accepted a call (may still be connecting)
  bool _activateSent = false; // guard so billing is activated at most once

  String get _id => widget.consultationId;

  @override
  void initState() {
    super.initState();
    if (widget.autoJoinCall) _acceptedCall = true;
  }

  @override
  void dispose() {
    _heartbeat?.cancel();
    _uiTick?.cancel();
    _call?.removeListener(_onCallChanged);
    _call?.leave();
    _input.dispose();
    super.dispose();
  }

  void _onCallChanged() {
    if (mounted) setState(() {});
  }

  /// Join the Agora voice channel once the astrologer has accepted, and start
  /// billing (activate) only when the customer's audio actually connects — so a
  /// call that never connects is never charged. Leaves on any terminal state.
  void _ensureCall(Consultation c) {
    if (c.type == ConsultationType.chat) return;
    final wantJoin = _acceptedCall || c.status == ConsultationStatus.active;
    if (wantJoin && _call == null && !_callJoinStarted) {
      _callJoinStarted = true;
      _joinCall(c);
    }
    // The customer is in the channel → begin billing now (waiting → active).
    if (c.status == ConsultationStatus.waiting &&
        _acceptedCall &&
        (_call?.remoteJoined ?? false) &&
        !_activateSent) {
      _activateSent = true;
      _activateOnConnect();
    }
    if (c.status.isTerminal && _call != null) {
      _call!.removeListener(_onCallChanged);
      _call!.leave();
      _call = null;
    }
  }

  /// Mark a call accepted without starting billing — audio join begins, and
  /// `_ensureCall` activates the meter once the customer connects.
  void _acceptCall() {
    setState(() => _acceptedCall = true);
  }

  Future<void> _activateOnConnect() async {
    final r = await ref.read(consultationServiceProvider).accept(_id);
    r.when(
      success: (_) {},
      failure: (f) {
        _activateSent = false; // allow a retry on the next connect tick
        _toast('Could not start the session: ${f.message}');
      },
    );
  }

  Future<void> _joinCall(Consultation c) async {
    final video = c.type == ConsultationType.video;
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      _toast('Microphone permission is needed to take calls.');
      return;
    }
    if (video) {
      final cam = await Permission.camera.request();
      if (!cam.isGranted) {
        _toast('Camera permission is needed for a video call.');
        return;
      }
    }
    if (!mounted) return;
    final engine = CallEngine()..addListener(_onCallChanged);
    _call = engine;
    final tok = await ref.read(rtcTokenServiceProvider).tokenFor(c.id);
    tok.when(
      success: (cred) => engine.join(
        appId: cred.appId,
        token: cred.token,
        channel: cred.channel,
        uid: cred.uid,
        video: video,
      ),
      failure: (f) => _toast('Could not connect the call: ${f.message}'),
    );
  }

  void _ensureHeartbeat(ConsultationStatus status) {
    if (status == ConsultationStatus.active) {
      _heartbeat ??= Timer.periodic(
          const Duration(seconds: 10), (_) => ref.read(consultationServiceProvider).tick(_id),);
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
              child: Text('End', style: Sky.label.copyWith(color: Sky.red, fontWeight: FontWeight.w800)),),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(consultationServiceProvider).end(_id);
      if (mounted) Navigator.of(context).pop();
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    try {
      await ref.read(firestoreProvider).collection('consultations').doc(_id).collection('messages').add({
        'senderId': widget.self.id,
        'type': 'text',
        'text': text,
        'timestamp': FieldValue.serverTimestamp(),
        'delivered': true,
        'seen': false,
      });
    } catch (_) {
      // Restore the text so it's never silently lost, and tell the user.
      _input.text = text;
      _input.selection = TextSelection.collapsed(offset: text.length);
      _toast("Couldn't send — check your connection and try again.");
    }
  }

  Future<void> _sendImage() async {
    try {
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
    } catch (_) {
      _toast("Couldn't send the image — please try again.");
    }
  }

  void _openDetails(Consultation c) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConsultationDetailsScreen(consultation: c, self: widget.self),
    ),);
  }

  /// Show the customer's full profile + kundli chart as an overlay sheet, so the
  /// astrologer can read them WITHOUT dropping the live voice/video call.
  Future<void> _showCustomerSheet(UserProfile? cust) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (_, controller) => Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Sky.line, borderRadius: BorderRadius.circular(99)),
            ),
            Expanded(
              child: SingleChildScrollView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: CustomerDetailsCard(profile: cust),
              ),
            ),
          ],
        ),
      ),
    );
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
            left: 20, right: 20, top: 18, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,),
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
            ],),
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

  /// Suggest a remedy that lands in the customer's "Suggested Remedies".
  Future<void> _suggestRemedy(Consultation c) async {
    final titleCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Sky.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            left: 20, right: 20, top: 18, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.self_improvement_rounded, size: 16, color: Sky.gold),
              const SizedBox(width: 7),
              Text('Suggest a remedy', style: Sky.h2),
              const Spacer(),
              Text('Sent to customer', style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
            ],),
            const SizedBox(height: 12),
            TextField(
              controller: titleCtrl,
              style: Sky.body,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Title (e.g. Chant Gayatri Mantra)',
                filled: true,
                fillColor: Sky.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: noteCtrl,
              minLines: 3,
              maxLines: 6,
              style: Sky.body,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'How to perform it — steps, timing, duration…',
                filled: true,
                fillColor: Sky.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 12),
            GoldButton(
              label: 'Send remedy',
              onPressed: () async {
                final title = titleCtrl.text.trim();
                final note = noteCtrl.text.trim();
                if (title.isEmpty && note.isEmpty) return;
                final remTitle = title.isEmpty ? 'Remedy' : title;
                final fs = ref.read(firestoreProvider);
                await fs.collection('remedies').add({
                  'customerId': c.customerId,
                  'astrologerId': widget.self.id,
                  'astrologerName': widget.self.name,
                  'astrologerPhoto': widget.self.profilePhoto,
                  'consultationId': c.id,
                  'title': remTitle,
                  'note': note,
                  'done': false,
                  'createdAt': FieldValue.serverTimestamp(),
                });
                // Also drop it into the conversation so the customer sees it in
                // context, as a distinct "remedy" message with its own styling.
                await fs.collection('consultations').doc(c.id).collection('messages').add({
                  'senderId': widget.self.id,
                  'type': 'remedy',
                  'title': remTitle,
                  'note': note,
                  'text': note.isEmpty ? remTitle : '$remTitle\n$note',
                  'timestamp': FieldValue.serverTimestamp(),
                  'delivered': true,
                  'seen': false,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                if (mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('Remedy sent to the customer')));
                }
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
        _ensureCall(c);
        // A call the astrologer has accepted jumps straight to the call view
        // (showing "Connecting…") even while the session is still `waiting`.
        if (c.status == ConsultationStatus.waiting && !_acceptedCall) return _waitingView(c);
        if (c.status.isTerminal) return _summaryView(c);
        return c.type == ConsultationType.chat ? _chatView(c) : _callView(c);
      },
    );
  }

  // ---- waiting / incoming ----
  // Shows the customer's COMPLETE details (identity, birth details, kundli) up
  // front so the astrologer reads the person before accepting.
  Widget _waitingView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    return SkyScaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Pill('Incoming ${c.type.name} request', color: Sky.gold, icon: typeIconLocal(c.type)),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: SingleChildScrollView(
                  child: CustomerDetailsCard(profile: cust),
                ),
              ),
              const SizedBox(height: 12),
              GoldButton(
                label: 'Accept consultation',
                icon: Icons.check_rounded,
                loading: _accepting,
                // Chats activate on accept; calls defer billing until the audio
                // connects, so we only mark the call accepted here.
                onPressed: _accepting
                    ? null
                    : (c.type == ConsultationType.chat ? _accept : _acceptCall),
              ),
              const SizedBox(height: 10),
              GhostButton(label: 'Decline', color: Sky.ink2, onPressed: _decline),
              const SizedBox(height: 6),
            ],
          ),
        ),
      ),
    );
  }

  /// Flip `seen:true` on the customer's unseen messages (participant-scoped by
  /// rules). Batched + best-effort; harmless if it races another mark.
  Future<void> _markSeen(List<Map<String, dynamic>> messages) async {
    final unseen = messages
        .where((m) => m['senderId'] != widget.self.id && m['seen'] != true && m['id'] is String)
        .toList();
    if (unseen.isEmpty) return;
    final fs = ref.read(firestoreProvider);
    final batch = fs.batch();
    for (final m in unseen) {
      batch.update(
        fs.collection('consultations').doc(_id).collection('messages').doc(m['id'] as String),
        {'seen': true},
      );
    }
    await batch.commit().catchError((_) {});
  }

  // ---- live chat ----
  Widget _chatView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    // Mark the customer's messages seen while the astrologer is viewing — clears
    // the inbox unread badge and gives the customer a real read-receipt.
    if (messages.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _markSeen(messages));
    }
    return SkyScaffold(
      child: Column(
        children: [
          _liveHeader(c, cust, dark: false),
          _quickAccess(c),
          // When the customer entered via a skill tile, tell the astrologer what
          // reading they came for (birth details are already shown below).
          if (c.requestedSkill != null) _SkillBanner(skill: c.requestedSkill!),
          // Fixed, collapsible customer details — auto-expanded on entry so the
          // astrologer reads the person, then collapses to reclaim the chat
          // viewport. Capped + scrollable so a tall expansion never overflows.
          ConstrainedBox(
            // Cap on the AVAILABLE height (screen minus the keyboard inset) so
            // the panel shrinks + scrolls when the keyboard is open, instead of
            // overflowing the column.
            constraints: BoxConstraints(
              maxHeight: (MediaQuery.of(context).size.height - MediaQuery.of(context).viewInsets.bottom) * 0.4,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: CustomerDetailsCard(profile: cust),
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Expanded(
                  child: messages.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Text('Say hello and begin the consultation.',
                                textAlign: TextAlign.center,
                                style: Sky.label.copyWith(fontSize: 13, color: Sky.ink3),),
                          ),
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
                      if (m['type'] == 'remedy') {
                        return _RemedyBubble(
                          mine: mine,
                          title: (m['title'] ?? 'Remedy') as String,
                          note: (m['note'] ?? '') as String,
                        );
                      }
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
                                      errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined),),
                                )
                              : Text((m['text'] ?? '') as String,
                                  style: Sky.body.copyWith(fontSize: 14.5, color: mine ? Colors.white : Sky.ink),),
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
                    style: Sky.h2.copyWith(fontSize: 14.5, color: fg), maxLines: 1, overflow: TextOverflow.ellipsis,),
                _headerTimerLine(c, dark),
              ],
            ),
          ),
          // Report / block this customer (safety — Apple/Play UGC requirement).
          ModerationMenu(targetId: c.customerId, targetLabel: 'customer', iconColor: fg),
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
            style: Sky.label.copyWith(fontSize: 11.5, color: dark ? Colors.white70 : Sky.ink2),),
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
          chip(Icons.self_improvement_rounded, 'Remedy', () => _suggestRemedy(c)),
          chip(Icons.lock_rounded, 'Notes', () => _quickNote(c)),
        ],
      ),
    );
  }

  Widget _composer() {
    // The Scaffold resizes above the keyboard, so we only need the gesture-bar
    // inset here (adding viewInsets on top would double-count and leave a big
    // gap above the keyboard). padding.bottom collapses to 0 while typing.
    final mq = MediaQuery.of(context);
    return Container(
      color: Sky.card,
      padding: EdgeInsets.only(left: 12, right: 8, top: 8, bottom: mq.padding.bottom + 10),
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

  // ---- voice / video call ----
  Widget _callView(Consultation c) {
    final cust = ref.watch(customerProvider(c.customerId)).valueOrNull;
    final video = c.type == ConsultationType.video;
    final call = _call;
    final muted = call?.muted ?? false;
    final speaker = call?.speakerOn ?? false;
    // "Connecting…" until the customer's audio is actually in the channel.
    final connecting = call == null || !call.isLive;
    if (video && call != null) return _videoCallView(c, cust, call, connecting);
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
                Text(
                    connecting
                        ? 'Connecting…'
                        : '${video ? 'Video' : 'Voice'} · ${Money.formatDuration(c.billedSeconds)}',
                    style: Sky.body.copyWith(color: Colors.white70),),
                if (call?.errorMessage != null) ...[
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(call!.errorMessage!,
                        textAlign: TextAlign.center,
                        style: Sky.label.copyWith(color: Sky.goldSoft),),
                  ),
                ],
                const SizedBox(height: 6),
                Text('Earned ${Money.formatPaise(widget.self.netOf(c.totalCharged))}',
                    style: Sky.label.copyWith(color: Sky.goldSoft, fontWeight: FontWeight.w700),),
                const Spacer(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _floatBtn(Icons.auto_awesome_rounded, 'Kundli', () => _showCustomerSheet(cust)),
                    const SizedBox(width: 22),
                    _floatBtn(Icons.lock_rounded, 'Notes', () => _quickNote(c)),
                  ],
                ),
                const SizedBox(height: 22),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _callBtn(muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                        muted ? Sky.red : Colors.white24, () => call?.toggleMute(),),
                    const SizedBox(width: 16),
                    _callBtn(Icons.volume_up_rounded,
                        speaker ? Sky.gold : Colors.white24, () => call?.toggleSpeaker(),),
                    // Camera control is wired in the video phase; voice calls omit it.
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

  // Full-screen video call: customer's camera fills the screen, astrologer's
  // self-preview picture-in-picture, with the same session controls.
  Widget _videoCallView(Consultation c, UserProfile? cust, CallEngine call, bool connecting) {
    final muted = call.muted;
    final cameraOn = call.cameraOn;
    return Scaffold(
      backgroundColor: Sky.purpleDeep,
      body: Stack(
        children: [
          Positioned.fill(child: CallVideoView(call: call)),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 22),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xAA000000), Color(0x00000000)],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cust?.name ?? 'Customer', style: Sky.h2.copyWith(color: Colors.white)),
                    const SizedBox(height: 2),
                    Text(
                      connecting
                          ? 'Connecting…'
                          : 'Video · ${Money.formatDuration(c.billedSeconds)}  ·  earned ${Money.formatPaise(widget.self.netOf(c.totalCharged))}',
                      style: Sky.label.copyWith(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _floatBtn(Icons.auto_awesome_rounded, 'Kundli', () => _showCustomerSheet(cust)),
                      const SizedBox(width: 18),
                      _floatBtn(Icons.lock_rounded, 'Notes', () => _quickNote(c)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _callBtn(muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                          muted ? Sky.red : Colors.white24, () => call.toggleMute(),),
                      const SizedBox(width: 14),
                      _callBtn(cameraOn ? Icons.videocam_rounded : Icons.videocam_off_rounded,
                          cameraOn ? Colors.white24 : Sky.red, () => call.toggleCamera(),),
                      const SizedBox(width: 14),
                      _callBtn(Icons.call_end_rounded, Sky.red, _confirmEnd),
                      const SizedBox(width: 14),
                      _callBtn(Icons.cameraswitch_rounded, Colors.white24, () => call.switchCamera()),
                    ],
                  ),
                ],
              ),
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
            ],),
          ),
        ],),
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
                ],),
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

/// A remedy dropped into the chat — a distinct cosmic gold card so it stands
/// apart from ordinary messages on both sides of the conversation.
/// A slim banner telling a HUMAN astrologer what reading the customer came for
/// (they entered via a skill tile). Birth details are already shown in the
/// customer card below, so this just names the discipline + a quick pointer.
class _SkillBanner extends StatelessWidget {
  const _SkillBanner({required this.skill});
  final String skill;

  @override
  Widget build(BuildContext context) {
    late final String label, hint;
    late final IconData icon;
    if (skill == 'palmistry') {
      label = 'Palmistry reading';
      hint = 'Ask for a clear photo of their right (dominant) hand.';
      icon = Icons.back_hand_rounded;
    } else if (skill == 'numerology') {
      label = 'Numerology reading';
      hint = 'Read from their name + date of birth (shown below).';
      icon = Icons.calculate_rounded;
    } else if (skill == 'tarot') {
      label = 'Tarot reading';
      hint = 'Ask their question, then draw the cards.';
      icon = Icons.style_rounded;
    } else {
      label = 'Reading requested';
      hint = '';
      icon = Icons.auto_awesome_rounded;
    }
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Sky.purpleDeep.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Sky.purpleDeep.withValues(alpha: 0.16)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: Sky.purpleDeep.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(icon, size: 18, color: Sky.purpleDeep),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Customer chose you for a $label',
                    style: Sky.label.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: Sky.purpleDeep)),
                if (hint.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(hint, style: Sky.label.copyWith(fontSize: 11, color: Sky.ink3)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RemedyBubble extends StatelessWidget {
  const _RemedyBubble({required this.mine, required this.title, required this.note});
  final bool mine;
  final String title;
  final String note;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.all(13),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFFF4D9), Color(0xFFF3E7C9)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Sky.gold.withValues(alpha: 0.45)),
          boxShadow: Sky.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.self_improvement_rounded, size: 15, color: Sky.gold),
                const SizedBox(width: 6),
                Text('REMEDY',
                    style: Sky.label.copyWith(
                        fontSize: 10, color: Sky.gold, fontWeight: FontWeight.w800, letterSpacing: 1,),),
              ],
            ),
            const SizedBox(height: 7),
            Text(title, style: Sky.h2.copyWith(fontSize: 14.5, color: Sky.purpleDeep)),
            if (note.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(note, style: Sky.body.copyWith(fontSize: 13.5, color: Sky.ink, height: 1.35)),
            ],
          ],
        ),
      ),
    );
  }
}
