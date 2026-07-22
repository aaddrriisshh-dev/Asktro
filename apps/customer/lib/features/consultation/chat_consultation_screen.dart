import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
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

/// The skill the user entered via for THIS session (e.g. 'tarot'), read once from
/// the consultation doc — it never changes mid-session. Drives the tarot
/// "Pull my cards" chip so it shows only in a tarot consultation.
final _requestedSkillProvider =
    FutureProvider.autoDispose.family<String?, String>((ref, id) async {
  final snap = await ref.watch(firestoreProvider).collection('consultations').doc(id).get();
  return snap.data()?['requestedSkill'] as String?;
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

class _ChatConsultationScreenState extends ConsumerState<ChatConsultationScreen>
    with WidgetsBindingObserver {
  final _input = TextEditingController();
  bool _lowBalanceShown = false;
  bool _graceShown = false;
  bool _leftForTerminal = false;
  bool _pausedShown = false;

  // Staged images (WhatsApp-style): picked photo(s) preview in the composer and
  // upload in the background; they only enter the chat when the user taps send.
  // A list so a guided palm scan can stage up to two hands together.
  final List<_StagedImage> _staged = [];
  bool _sendWhenUploaded = false; // user tapped send before uploads finished

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
    // Observe app lifecycle so billing pauses when the chat leaves the foreground.
    WidgetsBinding.instance.addObserver(this);
    // NOTE: we no longer activate on chat-open. For an AI persona, billing now
    // starts on the FIRST real AI reply (server-side, in the reply engine), so
    // the joining ritual + greeting are free and opening-then-leaving costs
    // nothing. A HUMAN session stays `waiting` until the astrologer accepts.
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (widget.readOnly) return;
    // Only a fully-resumed app counts as "present in the chat". Anything else
    // (backgrounded, app switcher, incoming call overlay) pauses the meter.
    ref
        .read(consultationControllerProvider(_id).notifier)
        .setForeground(state == AppLifecycleState.resumed);
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
              // Re-engage: start a fresh billed chat with the same astrologer.
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    onPressed: _chatAgainBusy ? null : _chatAgain,
                    icon: _chatAgainBusy
                        ? const SizedBox(
                            width: 18, height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),)
                        : const Icon(Icons.chat_bubble_rounded, size: 18),
                    label: Text(_chatAgainBusy ? 'Starting…' : 'Chat again',
                        style: AppTypography.body.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool _chatAgainBusy = false;

  /// From a finished (read-only) transcript: start a FRESH billed chat with the
  /// same astrologer. The AI carries the "where we left off" memory server-side.
  Future<void> _chatAgain() async {
    if (_chatAgainBusy) return;
    setState(() => _chatAgainBusy = true);
    final a = widget.astrologer;
    final res = await ref.read(consultationServiceProvider).create(astrologerId: a.id, type: ConsultationType.chat);
    if (!mounted) return;
    setState(() => _chatAgainBusy = false);
    res.when(
      success: (start) {
        ref.read(analyticsProvider).logEvent(AnalyticsEvents.consultationStarted, params: {
          'type': ConsultationType.chat.name,
          'astrologerId': a.id,
        });
        // Replace the transcript so Back doesn't return to a dead session.
        Navigator.of(context).pushReplacement(MaterialPageRoute(
          builder: (_) => ChatConsultationScreen(consultationId: start.consultationId, astrologer: a),
        ));
      },
      failure: (f) {
        if (f.code == 'INSUFFICIENT_BALANCE') {
          _promptRecharge();
        } else {
          _toast(f.message);
        }
      },
    );
  }

  void _promptRecharge() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add balance to consult'),
        content: const Text('You need a minimum wallet balance to start a consultation.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
          PrimaryButton(
            label: 'Recharge',
            expand: false,
            onPressed: () {
              Navigator.pop(context);
              context.push('/recharge');
            },
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
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

  /// Send on tap/Enter. Sends any staged image(s) (once their uploads finish)
  /// and/or the typed text — so a photo never enters the chat until send.
  Future<void> _send() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final text = _input.text.trim();
    final hasImages = _staged.isNotEmpty;

    // Images staged but an upload still running → remember the intent and fire
    // the moment they're all ready (the composer shows spinners meanwhile).
    if (hasImages && _staged.any((s) => s.uploading)) {
      setState(() => _sendWhenUploaded = true);
      return;
    }
    if (text.isEmpty && !hasImages) return;

    _input.clear();
    _setTyping(false);

    // 1) The image bubble(s), in the order staged (e.g. left hand then right).
    if (hasImages) {
      final urls = _staged.where((s) => s.url != null).map((s) => s.url!).toList();
      _clearStaged();
      for (final url in urls) {
        try {
          await _messagesCol.add({
            'senderId': uid,
            'type': 'image',
            'image': url,
            'timestamp': FieldValue.serverTimestamp(),
            'delivered': true,
            'seen': false,
          });
        } catch (_) {
          _toast("Couldn't send an image — please try again.");
        }
      }
    }

    // 2) The text bubble (a caption or a normal message).
    if (text.isNotEmpty) {
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
        _input.text = text; // never lose the words on a failure
        _input.selection = TextSelection.collapsed(offset: text.length);
        _toast("Couldn't send — check your connection and try again.");
      }
    }
  }

  /// Tarot "Open my cards" tapped → send the draw cue as the user's message. The
  /// reply engine reveals the session's (fixed) three-card spread and reads it.
  /// Neutral phrasing (no possessive) so it never reads as gendered.
  Future<void> _sendCardPull() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    try {
      await _messagesCol.add({
        'senderId': uid,
        'type': 'text',
        'text': '🔮 Cards khol dijiye',
        'timestamp': FieldValue.serverTimestamp(),
        'delivered': true,
        'seen': false,
      });
    } catch (_) {
      _toast("Couldn't send — please try again.");
    }
  }

  /// Attach tapped → Camera / Gallery / guided palm scan.
  Future<void> _pickImage() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded, color: AppColors.primary),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded, color: AppColors.primary),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.back_hand_rounded, color: AppColors.primary),
              title: const Text('Palm reading'),
              subtitle: const Text('Photograph each hand for a reading'),
              onTap: () => Navigator.pop(ctx, 'palm'),
            ),
          ],
        ),
      ),
    );
    if (choice == null) return;
    if (choice == 'palm') {
      await _scanPalm();
    } else {
      await _stageAndUpload(choice == 'camera' ? ImageSource.camera : ImageSource.gallery);
    }
  }

  /// Guided palm reading — a simple, reliable two-photo flow using the phone's
  /// normal camera: left hand, then (optionally) the right hand for a deeper
  /// two-hand reading. Each photo stages in the composer and sends on Enter.
  Future<void> _scanPalm() async {
    if (!await _palmPrompt(
      'Palm reading',
      'First, take a clear photo of your RIGHT (dominant) hand — palm facing the camera, fingers a little apart, in good light.',
      'Open camera',
      'Cancel',
    )) return;
    final right = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80);
    if (right == null) return;
    await _stageBytes(await right.readAsBytes());
    if (!mounted) return;

    if (await _palmPrompt(
      'Add your left hand?',
      'One hand shows what you were born with, the other what you’ve made of it — reading both gives a deeper, more accurate palm reading. Take a photo of your LEFT hand?',
      'Take left hand',
      'Send with right only',
    )) {
      final left = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80);
      if (left != null) await _stageBytes(await left.readAsBytes());
    }
  }

  /// A simple confirm dialog for the palm flow. Returns true on the primary action.
  Future<bool> _palmPrompt(String title, String body, String ok, String cancel) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ok)),
        ],
      ),
    );
    return r == true;
  }

  /// Pick from [source], stage it, and upload in the background.
  Future<void> _stageAndUpload(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(source: source, imageQuality: 70);
      if (picked == null) return;
      await _stageBytes(await picked.readAsBytes());
    } catch (_) {
      if (mounted) _toast("Couldn't attach the image — please try again.");
    }
  }

  /// Add one image to the staging tray and upload it in the background. Fires the
  /// pending send when the LAST outstanding upload completes.
  Future<void> _stageBytes(Uint8List data) async {
    if (ref.read(currentUidProvider) == null) return;
    final item = _StagedImage(data);
    setState(() => _staged.add(item));
    try {
      final refStore = FirebaseStorage.instance
          .ref('chat_images/$_id/${DateTime.now().millisecondsSinceEpoch}_${_staged.length}.jpg');
      await refStore.putData(data, SettableMetadata(contentType: 'image/jpeg'));
      final url = await refStore.getDownloadURL();
      if (!mounted || !_staged.contains(item)) return; // removed while uploading
      setState(() { item.url = url; item.uploading = false; });
      if (_sendWhenUploaded && _staged.every((s) => !s.uploading)) await _send();
    } catch (_) {
      if (!mounted) return;
      setState(() => _staged.remove(item));
      _toast("Couldn't upload an image — please try again.");
    }
  }

  void _removeStaged(_StagedImage item) {
    if (!mounted) return;
    setState(() => _staged.remove(item));
  }

  void _clearStaged() {
    if (!mounted) return;
    setState(() { _staged.clear(); _sendWhenUploaded = false; });
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
    // Before billing has started (session still `waiting` for the first AI reply)
    // there is nothing to warn about — skip so the seeded warnLevel/remainingSec
    // never misfires the low-balance dialog during the free opening.
    if (s.status == ConsultationStatus.waiting) return;

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
                // on their 3 free minutes, sees the countdown tick down. Hidden
                // until the session is active (billing starts on the first reply),
                // so a `waiting` session never shows a frozen 0:00.
                showCountdown: s.status == ConsultationStatus.active &&
                    (ref.watch(myProfileProvider).valueOrNull?.walletBalance ?? 0) <= 0,
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
            // Tarot: the "Open my cards" chip. It appears only AFTER the client has
            // sent their question (so the draw is never offered before there's a
            // question, or before the astrologer has joined), and disappears once
            // they've drawn. The draw cue is the "cards khol" message it sends.
            if (!widget.readOnly &&
                ref.watch(_requestedSkillProvider(_id)).valueOrNull == 'tarot' &&
                () {
                  final mine = messages.where((m) => m['senderId'] == uid);
                  bool isCue(Map<String, dynamic> m) =>
                      ((m['text'] ?? '') as String).toLowerCase().contains('cards khol');
                  final asked = mine.any((m) => !isCue(m));
                  final drew = mine.any(isCue);
                  return asked && !drew;
                }())
              _TarotDrawChip(onTap: _sendCardPull),
            _Composer(
              controller: _input,
              onSend: _send,
              onAttach: _pickImage,
              onChanged: (v) => _setTyping(v.trim().isNotEmpty),
              staged: _staged,
              onRemove: _removeStaged,
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

/// Split a message into inline spans, rendering `**bold**` segments in bold. The
/// AI uses this sparingly — only key numerology numbers and tarot card names — so
/// this is a deliberately tiny parser, not full markdown. Plain text with no
/// markers returns a single span (so normal messages are unaffected).
List<InlineSpan> _boldSpans(String text) {
  final re = RegExp(r'\*\*(.+?)\*\*');
  if (!text.contains('**')) return [TextSpan(text: text)];
  final spans = <InlineSpan>[];
  var i = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > i) spans.add(TextSpan(text: text.substring(i, m.start)));
    spans.add(TextSpan(text: m.group(1), style: const TextStyle(fontWeight: FontWeight.w700)));
    i = m.end;
  }
  if (i < text.length) spans.add(TextSpan(text: text.substring(i)));
  return spans.isEmpty ? [TextSpan(text: text)] : spans;
}

/// An ornate tarot card BACK — ivory face with a gold sun-and-moon emblem and a
/// crisp dark-gold edge. Our own artwork (no real deck), rendered from an inline
/// SVG so it stays sharp at any size.
const String _tarotCardBackSvg = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 62">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F4ECFB"/></linearGradient></defs>
  <rect x="1.5" y="1.5" width="41" height="59" rx="6" fill="url(#g)" stroke="#A9781F" stroke-width="1.7"/>
  <rect x="5" y="5" width="34" height="52" rx="4" fill="none" stroke="#B0862B" stroke-width="0.7" opacity="0.6"/>
  <g stroke="#BE8E28" stroke-width="1" fill="none" opacity="0.95">
    <circle cx="22" cy="24" r="6.5" fill="#E8C46B" fill-opacity="0.22"/>
    <g stroke-linecap="round">
      <line x1="22" y1="12" x2="22" y2="15.5"/><line x1="22" y1="32.5" x2="22" y2="36"/>
      <line x1="10" y1="24" x2="13.5" y2="24"/><line x1="30.5" y1="24" x2="34" y2="24"/>
      <line x1="13.5" y1="15.5" x2="16" y2="18"/><line x1="28" y1="30" x2="30.5" y2="32.5"/>
      <line x1="30.5" y1="15.5" x2="28" y2="18"/><line x1="16" y1="30" x2="13.5" y2="32.5"/>
    </g>
  </g>
  <path d="M25 22 a5 5 0 1 0 0 6 a4 4 0 0 1 0 -6 z" fill="#BE8E28" opacity="0.95"/>
  <circle cx="22" cy="48" r="1.3" fill="#C99A2E" opacity="0.9"/>
</svg>''';

/// The tarot draw affordance — a centered "pedestal" button above the composer: a
/// fanned trio of ornate card backs over a light→deep purple gradient with a thin
/// dark-gold frame and a faint ambient star haze. Tapping it sends the draw cue so
/// the reader reveals the spread. Deliberately calm — no timer, no billed wait.
class _TarotDrawChip extends StatelessWidget {
  const _TarotDrawChip({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: AppSpacing.lg, right: AppSpacing.lg, bottom: AppSpacing.sm, top: 2),
      child: Center(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 250,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF8C63C6), Color(0xFF6A44A6), Color(0xFF40266F)],
                stops: [0, 0.42, 1],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xEBC99A2E), width: 1.4), // thin dark-gold frame
              boxShadow: const [BoxShadow(color: Color(0x573C2378), blurRadius: 20, offset: Offset(0, 10))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Positioned.fill(child: CustomPaint(painter: _StarHazePainter())),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 15, 20, 13),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        _TarotFan(),
                        SizedBox(height: 9),
                        Text('Open my cards',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15.5, letterSpacing: 0.2)),
                        SizedBox(height: 2),
                        Text('Tap to draw your three cards',
                            style: TextStyle(color: Color(0xD1E7D7FF), fontWeight: FontWeight.w500, fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Three ornate card backs, fanned, with a soft gold glow behind them.
class _TarotFan extends StatelessWidget {
  const _TarotFan();

  @override
  Widget build(BuildContext context) {
    Widget card() => SizedBox(width: 32, height: 45, child: SvgPicture.string(_tarotCardBackSvg));
    return SizedBox(
      width: 104,
      height: 50,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // soft gold glow
          Container(
            width: 84,
            height: 40,
            decoration: const BoxDecoration(
              borderRadius: BorderRadius.all(Radius.circular(20)),
              boxShadow: [BoxShadow(color: Color(0x55E8C46B), blurRadius: 22, spreadRadius: -3)],
            ),
          ),
          Positioned(left: 8, top: 5, child: Transform.rotate(angle: -0.35, child: card())),
          Positioned(right: 8, top: 5, child: Transform.rotate(angle: 0.35, child: card())),
          card(),
        ],
      ),
    );
  }
}

/// A faint scatter of tiny star specks — the ambient "sky" behind the deck. Very
/// low opacity so it just whispers; not prominent stars sitting on the surface.
class _StarHazePainter extends CustomPainter {
  const _StarHazePainter();

  // x, y (as fractions of the bar), radius, opacity.
  static const _dots = <List<double>>[
    [0.14, 0.24, 1.4, 0.42], [0.80, 0.18, 1.2, 0.34], [0.60, 0.40, 1.0, 0.28],
    [0.30, 0.72, 1.3, 0.26], [0.90, 0.60, 1.0, 0.28], [0.46, 0.88, 1.1, 0.22],
    [0.07, 0.56, 1.1, 0.26], [0.72, 0.82, 1.0, 0.2],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    for (final d in _dots) {
      final paint = Paint()..color = Colors.white.withValues(alpha: d[3]);
      canvas.drawCircle(Offset(size.width * d[0], size.height * d[1]), d[2], paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
                // Cache to disk + decode capped to the bubble width so long
                // transcripts don't re-download / re-decode on every scroll.
                child: CachedNetworkImage(
                  imageUrl: imageUrl!,
                  fit: BoxFit.cover,
                  memCacheWidth: (MediaQuery.of(context).size.width * 0.72 *
                          MediaQuery.of(context).devicePixelRatio)
                      .round(),
                  placeholder: (_, __) => const SizedBox(
                      height: 120,
                      child: Center(
                          child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2)))),
                  errorWidget: (_, __, ___) =>
                      const Icon(Icons.broken_image_outlined),
                ),
              ),
            if (text.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(top: hasImage ? 6 : 0, left: hasImage ? 6 : 0, right: hasImage ? 6 : 0),
                child: Text.rich(
                  TextSpan(
                    style: AppTypography.body.copyWith(
                        color: mine ? Colors.white : AppColors.textDark, fontSize: 14.5, height: 1.3,),
                    children: _boldSpans(text),
                  ),
                ),
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
    required this.staged,
    required this.onRemove,
  });
  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final ValueChanged<String> onChanged;
  final List<_StagedImage> staged;
  final ValueChanged<_StagedImage> onRemove;

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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Staged image tray (0, 1 or 2 thumbnails).
          if (staged.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: AppSpacing.sm, bottom: AppSpacing.sm, top: AppSpacing.xs),
              child: Row(
                children: [
                  for (final item in staged)
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: _StagedThumb(item: item, onCancel: () => onRemove(item)),
                    ),
                ],
              ),
            ),
          Row(
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
                  decoration: InputDecoration(
                    hintText: staged.isNotEmpty ? 'Add a caption…' : 'Type a message...',
                    filled: false,
                    border: InputBorder.none,
                  ),
                ),
              ),
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                onPressed: onSend,
                icon: const Icon(Icons.send_rounded, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One staged photo thumbnail in the composer tray. A spinner sits over it while
/// its upload is in flight (the "image is loading" cue); an X discards it. Photos
/// enter the chat only when the user taps send.
class _StagedThumb extends StatelessWidget {
  const _StagedThumb({required this.item, required this.onCancel});
  final _StagedImage item;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.memory(item.bytes, width: 78, height: 78, fit: BoxFit.cover),
        ),
        if (item.uploading)
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                color: Colors.black38,
                alignment: Alignment.center,
                child: const SizedBox(
                  width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                ),
              ),
            ),
          ),
        Positioned(
          top: -6,
          right: -6,
          child: GestureDetector(
            onTap: onCancel,
            child: Container(
              decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
              padding: const EdgeInsets.all(3),
              child: const Icon(Icons.close_rounded, size: 15, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

/// A photo staged in the composer, uploading in the background. `url` is set when
/// the upload completes; `uploading` gates the spinner + the send-when-ready flow.
class _StagedImage {
  _StagedImage(this.bytes);
  final Uint8List bytes;
  String? url;
  bool uploading = true;
}
