import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../app/celestial_background.dart';
import '../../data/messaging_service.dart';
import 'consultation_controller.dart';
import 'consultation_header.dart';
import 'consultation_end.dart';
import 'chat_kundli_card.dart';

/// How long a `typing:true` flag stays "live" without a refresh. Covers the AI's
/// compose time (generation + human typing-delay) while still auto-clearing if a
/// peer ever sets `typing:true` and vanishes without clearing it.
const _typingStaleAfter = Duration(seconds: 20);

/// Whether the peer is currently typing, plus WHEN the flag was set. TRUE only
/// when their typing doc has `typing == true` AND the flag is still fresh. A 2s
/// ticker re-evaluates so a stale flag clears on its own — the Firestore snapshot
/// alone can't, because it only fires when the doc changes, never when a
/// timestamp simply ages out. `atMs` lets the UI ignore a flag that a newer
/// message has already superseded (belt-and-suspenders against a stuck indicator).
final _peerTypingProvider =
    StreamProvider.autoDispose.family<({bool typing, int? atMs}), ({String id, String peerId})>((ref, arg) {
  final controller = StreamController<({bool typing, int? atMs})>();
  var typingFlag = false;
  DateTime? at;

  bool live() => typingFlag && at != null && DateTime.now().difference(at!) < _typingStaleAfter;
  void emit() {
    if (!controller.isClosed) controller.add((typing: live(), atMs: at?.millisecondsSinceEpoch));
  }

  final sub = ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(arg.id)
      .collection('typing')
      .doc(arg.peerId)
      .snapshots()
      .listen((d) {
    final data = d.data();
    typingFlag = d.exists && data?['typing'] == true;
    final ts = data?['at'];
    at = ts is Timestamp ? ts.toDate() : (typingFlag ? DateTime.now() : null);
    emit();
  });

  final ticker = Timer.periodic(const Duration(seconds: 2), (_) => emit());
  ref.onDispose(() {
    sub.cancel();
    ticker.cancel();
    controller.close();
  });
  return controller.stream;
});

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

class ChatConsultationScreen extends ConsumerStatefulWidget {
  const ChatConsultationScreen({
    super.key,
    required this.consultationId,
    required this.astrologer,
    this.readOnly = false,
  });
  final String consultationId;
  final Astrologer astrologer;

  /// Opened from history for a finished consultation: show the transcript only
  /// (no activation, no billing, no composer).
  final bool readOnly;

  @override
  ConsumerState<ChatConsultationScreen> createState() => _ChatConsultationScreenState();
}

class _ChatConsultationScreenState extends ConsumerState<ChatConsultationScreen> {
  final _input = TextEditingController();
  bool _lowBalanceShown = false;
  bool _graceShown = false;
  bool _leftForTerminal = false;
  bool _pausedShown = false;

  // Join-chime: ids of "<name> has joined" lines we've already sounded, so the
  // chime fires once when the astrologer arrives — never for join lines that
  // were already on screen when an existing chat was reopened.
  final Set<String> _chimedJoins = {};
  bool _joinBaselineSet = false;
  final AudioPlayer _chimePlayer = AudioPlayer();

  String get _id => widget.consultationId;

  @override
  void initState() {
    super.initState();
    if (widget.readOnly) return; // history view — never (re)activate/bill.
    // AI personas have no human to accept, so the customer activates instantly.
    // For a HUMAN astrologer we must NOT auto-activate: the session has to stay
    // `waiting` so it appears in the astrologer's request queue and THEY accept
    // it (activating here would flip it to `active` and steal it from them).
    if (!widget.astrologer.isAI) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // AI has no human to accept, so the customer activates instantly. Surface
      // failure instead of leaving the chat silently stuck in `waiting`.
      final r = await ref.read(consultationControllerProvider(_id).notifier).activate();
      if (!mounted) return;
      r.when(
        success: (_) {},
        failure: (f) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text("Couldn't start the session: ${f.message}")));
          Navigator.of(context).maybePop();
        },
      );
    });
  }

  // Read-only transcript for a finished consultation (opened from history).
  Widget _readOnlyView() {
    final uid = ref.watch(currentUidProvider);
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.card,
        foregroundColor: AppColors.textDark,
        titleSpacing: 0,
        title: Row(
          children: [
            AppAvatar(name: widget.astrologer.name, photoUrl: widget.astrologer.profilePhoto, size: 32),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(widget.astrologer.name,
                  style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
                  overflow: TextOverflow.ellipsis,),
            ),
          ],
        ),
      ),
      body: DotGridBackground(
        // SafeArea owns the bottom gesture-bar inset (instead of hand-adding
        // MediaQuery padding), so nothing can be pushed a few pixels past the
        // viewport edge — the source of the stray "N PIXELS" overflow strip.
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              // The customer's own kundli, pinned at the top of every chat so
              // they can reference it during the consult (collapsed by default).
              const Padding(
                padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, 0),
                child: ChatKundliCard(),
              ),
              Expanded(
                child: messages.isEmpty
                    ? const EmptyState(
                        icon: Icons.history_rounded,
                        title: 'No messages',
                        message: 'This consultation has no saved messages.',
                      )
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        itemCount: messages.length,
                        itemBuilder: (_, i) {
                          final m = messages[i];
                          if (m['type'] == 'system') {
                            return _SystemLine(text: (m['text'] ?? '') as String);
                          }
                          final isRemedy = m['type'] == 'remedy';
                          return _Bubble(
                            text: (m['text'] ?? '') as String,
                            imageUrl: m['image'] as String?,
                            mine: m['senderId'] == uid,
                            seen: m['seen'] == true,
                            remedyTitle: isRemedy ? (m['title'] ?? 'Remedy') as String : null,
                            remedyNote: isRemedy ? (m['note'] ?? '') as String : null,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _input.dispose();
    _chimePlayer.dispose();
    super.dispose();
  }

  CollectionReference<Map<String, dynamic>> get _messagesCol => ref
      .read(firestoreProvider)
      .collection('consultations')
      .doc(_id)
      .collection('messages');

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    final uid = ref.read(currentUidProvider);
    if (text.isEmpty || uid == null) return;
    _input.clear();
    _setTyping(false);
    try {
      await _messagesCol.add({
        'senderId': uid,
        'type': 'text',
        'text': text,
        'timestamp': FieldValue.serverTimestamp(),
        'delivered': true,
        'seen': false,
      });
    } catch (_) {
      // Restore the text so the message is never silently lost, and tell the user.
      _input.text = text;
      _input.selection = TextSelection.collapsed(offset: text.length);
      _toast("Couldn't send — check your connection and try again.");
    }
  }

  Future<void> _sendImage() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    try {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 70);
      if (picked == null) return;
      final data = await picked.readAsBytes();
      final refStore = FirebaseStorage.instance
          .ref('chat_images/$_id/${DateTime.now().millisecondsSinceEpoch}.jpg');
      await refStore.putData(data, SettableMetadata(contentType: 'image/jpeg'));
      final url = await refStore.getDownloadURL();
      await _messagesCol.add({
        'senderId': uid,
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

  DateTime _lastTypingWrite = DateTime.fromMillisecondsSinceEpoch(0);
  void _setTyping(bool typing) {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    // Throttle writes to at most one per ~3s while typing.
    final now = DateTime.now();
    if (typing && now.difference(_lastTypingWrite).inSeconds < 3) return;
    _lastTypingWrite = now;
    ref
        .read(firestoreProvider)
        .collection('consultations')
        .doc(_id)
        .collection('typing')
        .doc(uid)
        .set({'typing': typing, 'at': FieldValue.serverTimestamp()})
        // Best-effort: a denied typing write (e.g. session just ended) must
        // never surface as an uncaught crash.
        .catchError((_) {});
  }

  /// Mark the astrologer's delivered-but-unseen messages as seen.
  void _markSeen(List<Map<String, dynamic>> messages) {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    for (final m in messages) {
      if (m['senderId'] != uid && m['seen'] != true) {
        _messagesCol.doc(m['id'] as String).update({'seen': true}).catchError((_) {});
      }
    }
  }

  /// Soft chime + haptic when the astrologer's "has joined" line first appears.
  /// The first stream emission is treated as a baseline (join lines already on
  /// screen when reopening a chat are NOT re-sounded); only lines that arrive
  /// afterwards fire the chime, and each fires exactly once.
  void _maybeChimeJoin(List<Map<String, dynamic>> messages) {
    if (widget.readOnly || !mounted) return;
    final joinedIds = messages
        .where((m) => m['type'] == 'system' &&
            m['id'] is String &&
            (m['text'] ?? '').toString().toLowerCase().contains('joined'))
        .map((m) => m['id'] as String);
    if (!_joinBaselineSet) {
      _chimedJoins.addAll(joinedIds); // pre-existing → don't chime on open
      _joinBaselineSet = true;
      return;
    }
    var fresh = false;
    for (final id in joinedIds) {
      if (_chimedJoins.add(id)) fresh = true;
    }
    if (fresh) {
      // A real audible chime (bundled asset — reliable on iOS, unlike
      // SystemSound) plus a soft haptic. Best-effort: never break the chat.
      _chimePlayer.play(AssetSource('sounds/join_chime.wav'), volume: 0.7).catchError((_) {});
      HapticFeedback.lightImpact();
    }
  }

  /// Handle the session reaching any terminal state from the server side — the
  /// astrologer ended it, the request expired unaccepted, or the timeout sweep
  /// closed a paused session. Without this the customer is stranded on a frozen
  /// chat (and could keep "sending" into a dead session). The customer-initiated
  /// End owns its own navigation and sets [_leftForTerminal] first, so it is not
  /// double-handled here.
  void _maybeHandleTerminal(ConsultationState s) {
    if (_leftForTerminal || !mounted) return;
    final c = s.consultation;
    if (!c.status.isTerminal) return;
    _leftForTerminal = true;
    // Dismiss the non-dismissible "paused" sheet if it's up (e.g. the sweep just
    // expired a paused session while it was showing).
    if (_pausedShown) {
      Navigator.of(context).maybePop();
      _pausedShown = false;
    }
    final everStarted = c.billedSeconds > 0 || c.duration > 0;
    if (everStarted) {
      // It ran, then ended by the astrologer or the timeout sweep — show the
      // same completion + rating flow as a self-initiated end.
      showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer);
    } else {
      // Never started (expired unaccepted / declined) — nothing was billed.
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text("The astrologer couldn't take your request right now — you haven't been charged."),
      ),);
      Navigator.of(context).maybePop();
    }
  }

  Future<void> _handleWarn(ConsultationState s) async {
    // Grace minute — a one-time gift when the balance ran out. Celebrate it and
    // suppress the low-balance nudge for this cycle so they don't stack.
    if (s.consultation.graceGranted && !_graceShown) {
      _graceShown = true;
      _lowBalanceShown = true;
      if (mounted) await showGraceBonusDialog(context, minutes: 1);
      return;
    }

    // Level 1 — polite premium recharge dialog (once).
    if (s.warnLevel == 1 && !_lowBalanceShown) {
      _lowBalanceShown = true;
      final recharge = await showLowBalanceDialog(context, remainingSec: s.displayRemainingSec);
      if (recharge == true && mounted) _goRecharge();
    }
    if (s.warnLevel < 1) _lowBalanceShown = false;

    // Level 3 — paused; block until recharge or end. Guard against stacking.
    if (s.status == ConsultationStatus.paused && !_pausedShown && mounted) {
      await _showPaused();
    }
  }

  Future<void> _showPaused() async {
    _pausedShown = true;
    // A CENTERED dialog (not a bottom sheet) so the buttons never fall into the
    // phone's bottom gesture-bar / safe area and become un-tappable.
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(AppSpacing.xl),
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.dialog)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.pause_circle_filled_rounded, size: 56, color: AppColors.primary),
              const SizedBox(height: AppSpacing.md),
              Text('Consultation Paused', style: AppTypography.subtitle, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.xs),
              Text('Recharge now to continue exactly where you left off.',
                  style: AppTypography.caption, textAlign: TextAlign.center,),
              const SizedBox(height: AppSpacing.xl),
              PrimaryButton(
                label: 'Recharge',
                onPressed: () {
                  Navigator.pop(context);
                  _goRecharge();
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              SecondaryButton(
                label: 'End Consultation',
                onPressed: () {
                  Navigator.pop(context);
                  _end();
                },
              ),
            ],
          ),
        ),
      ),
    );
    _pausedShown = false;
  }

  Future<void> _goRecharge() async {
    await context.push('/recharge');
    // The recharge function auto-resumes a paused session; also nudge resume.
    if (mounted) await ref.read(consultationControllerProvider(_id).notifier).resume();
  }

  Future<void> _end() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('End consultation?'),
        content: const Text('You will be billed for the time used so far.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          DestructiveButton(label: 'End', onPressed: () => Navigator.pop(context, true)),
        ],
      ),
    );
    if (confirm != true) return;
    // We own the summary navigation; suppress the stream terminal handler so the
    // completion screen isn't shown twice.
    _leftForTerminal = true;
    final r = await ref.read(consultationControllerProvider(_id).notifier).end();
    if (!mounted) return;
    r.when(
      success: (c) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.consultationCompleted, params: {
          'type': c.type.name,
          'durationSec': c.duration,
        },);
        showConsultationEnd(context, ref, consultation: c, astrologer: widget.astrologer);
      },
      failure: (f) {
        _leftForTerminal = false; // end failed; stay in the session
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
      },
    );
  }

  /// Astrologer name-card just under the header — a proper profile card on a
  /// lavender panel: avatar, name + "Asktro Verified" badge, and three stat
  /// chips (experience, sessions, rating).
  Widget _astroBanner() {
    final a = widget.astrologer;
    return Container(
      width: double.infinity,
      color: AppColors.card,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.accentLavender,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
        ),
        child: Row(
          children: [
            AppAvatar(name: a.name, photoUrl: a.profilePhoto, size: 50),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(a.name,
                            style: AppTypography.body
                                .copyWith(fontWeight: FontWeight.w800, fontSize: 15.5),
                            overflow: TextOverflow.ellipsis,),
                      ),
                      if (a.verified) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.verified_rounded, size: 11, color: Colors.white),
                              const SizedBox(width: 3),
                              Text('Asktro Verified',
                                  style: AppTypography.caption.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 9.5,
                                      letterSpacing: 0.2,),),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _statChip(Icons.workspace_premium_rounded,
                          a.experience > 0 ? '${a.experience} yrs' : 'New', 'Experience',),
                      const SizedBox(width: 8),
                      _statChip(Icons.forum_rounded, '${a.totalConsultations}', 'Sessions'),
                      const SizedBox(width: 8),
                      _statChip(Icons.star_rounded,
                          a.rating > 0 ? a.rating.toStringAsFixed(1) : '—', 'Rating', gold: true,),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statChip(IconData icon, String value, String label, {bool gold = false}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 13, color: gold ? AppColors.warning : AppColors.primary),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w800, color: AppColors.textDark),),
                  ),
                ],
              ),
              const SizedBox(height: 1),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.caption.copyWith(fontSize: 9, color: AppColors.textSecondary),),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    if (widget.readOnly) return _readOnlyView();
    final async = ref.watch(consultationControllerProvider(_id));
    ref.listen(consultationControllerProvider(_id), (_, next) {
      final s = next.valueOrNull;
      if (s == null) return;
      _handleWarn(s);
      _maybeHandleTerminal(s);
    });
    // A soft chime + haptic the moment the astrologer joins.
    ref.listen(_messagesProvider(_id), (_, next) {
      _maybeChimeJoin(next.valueOrNull ?? const []);
    });

    final uid = ref.watch(currentUidProvider);
    final messages = ref.watch(_messagesProvider(_id)).valueOrNull ?? const [];
    final typingState = ref.watch(_peerTypingProvider((id: _id, peerId: widget.astrologer.id))).valueOrNull;
    // Show the dots only if the flag is live AND no astrologer message has landed
    // since she started typing. If her latest message is newer than the typing
    // flag, the flag is stale — hide the dots (kills a lingering indicator),
    // while still showing them before the NEXT bubble (its flag is refreshed).
    var peerTyping = typingState?.typing ?? false;
    if (peerTyping && typingState?.atMs != null && messages.isNotEmpty) {
      final newest = messages.first;
      if (newest['senderId'] == widget.astrologer.id) {
        final ms = (newest['timestamp'] as Timestamp?)?.millisecondsSinceEpoch;
        if (ms != null && ms >= typingState!.atMs!) peerTyping = false;
      }
    }
    if (messages.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _markSeen(messages));
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      // Back just leaves the chat; the session keeps running and is resumable
      // from the Consultations tab. Ending is an explicit choice (the End button).
      body: DotGridBackground(
        child: Column(
          children: [
            async.when(
              loading: () => const SizedBox(height: 90),
              // A stream error must still offer a way out (never a dead header).
              error: (_, __) => SafeArea(
                bottom: false,
                child: Container(
                  color: AppColors.card,
                  padding: const EdgeInsets.fromLTRB(4, 8, 12, 10),
                  child: Row(children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.arrow_back_rounded, color: AppColors.textDark),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text('Connection lost. Please go back and try again.',
                          style: AppTypography.caption.copyWith(color: AppColors.error),),
                    ),
                  ],),
                ),
              ),
              data: (s) => ConsultationHeader(
                astrologerName: widget.astrologer.name,
                photoUrl: widget.astrologer.profilePhoto,
                verified: widget.astrologer.verified,
                remainingSec: s.displayRemainingSec,
                warnLevel: s.warnLevel,
                onRecharge: _goRecharge,
                onBack: () => Navigator.of(context).maybePop(),
                onEnd: _end,
                // A paid user (real wallet balance) sees no countdown — only the
                // 1-minute-before-exhaustion warning. A fresh free user, running
                // on their 3 free minutes, sees the countdown tick down.
                showCountdown: (ref.watch(myProfileProvider).valueOrNull?.walletBalance ?? 0) <= 0,
              ),
            ),
            _astroBanner(),
            // The customer's own kundli, pinned at the top of the LIVE chat so
            // the chart is the first thing they see (collapsible; open by default).
            const Padding(
              padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
              child: ChatKundliCard(),
            ),
            // Messages + the typing indicator live TOGETHER in the flexible
            // region, so the typing row can never steal fixed height from the
            // composer and overflow the column when the keyboard opens.
            Expanded(
              child: Column(
                children: [
                  Expanded(
                    child: messages.isEmpty
                        ? const EmptyState(
                            icon: Icons.waving_hand_rounded,
                            title: 'Say hello 👋',
                            message: 'Share your birth details to begin your consultation.',
                          )
                        : ListView.builder(
                            reverse: true,
                            padding: const EdgeInsets.all(AppSpacing.lg),
                            itemCount: messages.length,
                            itemBuilder: (_, i) {
                              final m = messages[i];
                              if (m['type'] == 'system') {
                                return _SystemLine(text: (m['text'] ?? '') as String);
                              }
                              final mine = m['senderId'] == uid;
                              final isRemedy = m['type'] == 'remedy';
                              return _Bubble(
                                text: (m['text'] ?? '') as String,
                                imageUrl: m['image'] as String?,
                                mine: mine,
                                seen: m['seen'] == true,
                                remedyTitle: isRemedy ? (m['title'] ?? 'Remedy') as String : null,
                                remedyNote: isRemedy ? (m['note'] ?? '') as String : null,
                              );
                            },
                          ),
                  ),
                  if (peerTyping)
                    const Padding(
                      padding: EdgeInsets.only(left: AppSpacing.lg, bottom: AppSpacing.xs),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: _TypingBubble(),
                      ),
                    ),
                ],
              ),
            ),
            _Composer(
              controller: _input,
              onSend: _send,
              onAttach: _sendImage,
              onChanged: (v) => _setTyping(v.trim().isNotEmpty),
            ),
          ],
        ),
      ),
    );
  }
}

/// A centered system status line. The "<name> has joined" line renders as a
/// green confirmation pill with a check — so the user clearly sees their
/// astrologer has arrived — while "joining…" stays a subtle grey line. Never a
/// chat bubble, never attributed to a sender.
class _SystemLine extends StatelessWidget {
  const _SystemLine({required this.text});
  final String text;

  static const _joinedGreen = Color(0xFF2E7D32);
  static const _joinedBg = Color(0xFFE6F4EA);

  @override
  Widget build(BuildContext context) {
    final t = text.trim();
    if (t.isEmpty) return const SizedBox.shrink();
    // "joined" (arrived) → confirmation; "joining…" → still subtle grey.
    final joined = t.toLowerCase().contains('joined');
    if (!joined) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Center(
          child: Text(
            t,
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(
              color: AppColors.textSecondary,
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: _joinedBg,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle_rounded, size: 15, color: _joinedGreen),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  t,
                  textAlign: TextAlign.center,
                  style: AppTypography.caption.copyWith(
                    color: _joinedGreen,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A left-aligned "she's typing" chat bubble with three jumping dots (the live
/// typing cue). Shown only while the peer-typing flag is genuinely live.
class _TypingBubble extends StatefulWidget {
  const _TypingBubble();

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
          bottomLeft: Radius.circular(4),
          bottomRight: Radius.circular(16),
        ),
        boxShadow: AppShadows.soft,
      ),
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            // Each dot leads the next by a third of the cycle, so the crest
            // travels left→right like a wave.
            final phase = (_c.value - i * 0.2) % 1.0;
            final lift = (phase < 0.5 ? phase : 1 - phase) * 2; // 0→1→0
            return Padding(
              padding: EdgeInsets.only(right: i == 2 ? 0 : 5),
              child: Transform.translate(
                offset: Offset(0, -3 * lift),
                child: Opacity(
                  opacity: 0.4 + 0.6 * lift,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AppColors.textSecondary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.text,
    required this.mine,
    required this.seen,
    this.imageUrl,
    this.remedyTitle,
    this.remedyNote,
  });
  final String text;
  final String? imageUrl;
  final bool mine;
  final bool seen;
  final String? remedyTitle;
  final String? remedyNote;

  @override
  Widget build(BuildContext context) {
    if (remedyTitle != null) return _remedy(context);
    final hasImage = imageUrl != null && imageUrl!.isNotEmpty;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: hasImage
            ? const EdgeInsets.all(4)
            : const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          gradient: mine && !hasImage ? AppColors.primaryGradient : null,
          color: mine
              ? (hasImage ? AppColors.primary : null)
              : AppColors.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          boxShadow: mine ? null : AppShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasImage)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(imageUrl!, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined),),
              ),
            if (text.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(top: hasImage ? 6 : 0, left: hasImage ? 6 : 0, right: hasImage ? 6 : 0),
                child: Text(text,
                    style: AppTypography.body.copyWith(
                        color: mine ? Colors.white : AppColors.textDark, fontSize: 14.5, height: 1.3,),),
              ),
            if (mine)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 2),
                child: Icon(seen ? Icons.done_all_rounded : Icons.done_rounded,
                    size: 14, color: mine ? Colors.white70 : AppColors.textSecondary,),
              ),
          ],
        ),
      ),
    );
  }

  // A remedy the astrologer suggested — a distinct cosmic card so it reads
  // apart from ordinary chat, and mirrors the "Your Personal Remedies" screen.
  Widget _remedy(BuildContext context) {
    final note = remedyNote ?? '';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(AppSpacing.md),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF3ECFF), Color(0xFFFFF6E2)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
          boxShadow: AppShadows.soft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.self_improvement_rounded, size: 15, color: AppColors.warning),
                const SizedBox(width: 6),
                Text('PERSONAL REMEDY',
                    style: AppTypography.caption.copyWith(
                        color: AppColors.warning, fontWeight: FontWeight.w800, letterSpacing: 0.8, fontSize: 10,),),
              ],
            ),
            const SizedBox(height: 7),
            Text(remedyTitle!,
                style: AppTypography.body.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),),
            if (note.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(note, style: AppTypography.body.copyWith(fontSize: 14, height: 1.35, color: AppColors.textDark)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onSend,
    required this.onAttach,
    required this.onChanged,
  });
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.card,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      // Scaffold.resizeToAvoidBottomInset lifts this above the keyboard; the
      // extra padding.bottom keeps it clear of the phone's gesture/nav bar so it
      // never hides under the viewport.
      padding: EdgeInsets.only(
        left: AppSpacing.sm,
        right: AppSpacing.sm,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm + MediaQuery.of(context).padding.bottom,
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: onAttach,
            icon: const Icon(Icons.add_photo_alternate_outlined, color: AppColors.primary),
            tooltip: 'Send image',
          ),
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              onChanged: onChanged,
              decoration: const InputDecoration(hintText: 'Type a message...', filled: false, border: InputBorder.none),
            ),
          ),
          IconButton.filled(
            style: IconButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: onSend,
            icon: const Icon(Icons.send_rounded, color: Colors.white),
          ),
        ],
      ),
    );
  }
}
