import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Guided palm capture. Shows a live camera with a large hand-shaped outline the
/// user aligns their palm into (so the lines come out framed + in focus → a
/// better reading). It explicitly asks for the LEFT hand first, then offers the
/// RIGHT hand for a deeper two-hand comparison. The outline MIRRORS between hands
/// (a left and right hand are mirror images — the thumb swaps sides). Returns the
/// captured bytes (1 or 2, left-then-right) via Navigator.pop.
///
/// Defensive: a denied permission or a camera-init failure shows a clear message,
/// never a crash. Requires a device rebuild (uses the `camera` package).
class PalmScanScreen extends StatefulWidget {
  const PalmScanScreen({super.key});

  @override
  State<PalmScanScreen> createState() => _PalmScanScreenState();
}

class _PalmScanScreenState extends State<PalmScanScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  bool _initializing = true;
  String? _error;
  bool _capturing = false;

  final List<Uint8List> _captured = [];
  String _hand = 'left'; // which hand we're currently asking for
  Uint8List? _review; // a just-taken shot awaiting Retake/Use
  bool _askSecond = false; // showing the "add the other hand?" prompt

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  Future<void> _start() async {
    try {
      final status = await Permission.camera.request();
      if (!status.isGranted) {
        _fail('Camera permission is needed to scan your palm.\nEnable it in Settings.');
        return;
      }
      final cams = await availableCameras();
      if (cams.isEmpty) { _fail('No camera found on this device.'); return; }
      final cam = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cams.first,
      );
      final controller = CameraController(cam, ResolutionPreset.high,
          enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await controller.initialize();
      if (!mounted) { await controller.dispose(); return; }
      setState(() { _controller = controller; _initializing = false; });
    } catch (_) {
      _fail("Couldn't open the camera. Please try again.");
    }
  }

  void _fail(String msg) {
    if (!mounted) return;
    setState(() { _error = msg; _initializing = false; });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      c.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _start();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized || _capturing) return;
    setState(() => _capturing = true);
    try {
      final file = await c.takePicture();
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() { _review = bytes; _capturing = false; });
    } catch (_) {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _useShot() {
    final shot = _review;
    if (shot == null) return;
    _captured.add(shot);
    if (_captured.length >= 2) {
      Navigator.of(context).pop(_captured); // both hands done
      return;
    }
    setState(() { _review = null; _askSecond = true; });
  }

  void _retake() => setState(() => _review = null);

  void _sendWithOne() => Navigator.of(context).pop(_captured);

  void _addSecond() => setState(() { _askSecond = false; _hand = 'right'; });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Scan your palm'),
        elevation: 0,
      ),
      body: _error != null
          ? _ErrorView(message: _error!, onClose: () => Navigator.of(context).pop())
          : _initializing || _controller == null
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : _review != null
                  ? _ReviewView(bytes: _review!, hand: _hand, onRetake: _retake, onUse: _useShot)
                  : _askSecond
                      ? _AskSecondView(onAdd: _addSecond, onSend: _sendWithOne)
                      : _cameraView(),
    );
  }

  Widget _cameraView() {
    final handLabel = _hand == 'left' ? 'LEFT' : 'RIGHT';
    // Convention: palm facing an un-mirrored (back) camera → a RIGHT hand shows
    // its thumb on the viewer's LEFT, a LEFT hand on the viewer's RIGHT.
    final thumbOnLeft = _hand == 'right';
    return Stack(
      fit: StackFit.expand,
      children: [
        Center(child: CameraPreview(_controller!)),
        Positioned.fill(
          child: IgnorePointer(child: CustomPaint(painter: _HandOutlinePainter(thumbOnLeft: thumbOnLeft))),
        ),
        Positioned(
          top: 16, left: 20, right: 20,
          child: Column(
            children: [
              Text('Place your $handLabel hand in the outline',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800,
                      shadows: [Shadow(blurRadius: 6, color: Colors.black)])),
              const SizedBox(height: 4),
              const Text('Palm facing the camera · fingers spread · good light',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 12.5,
                      shadows: [Shadow(blurRadius: 6, color: Colors.black)])),
            ],
          ),
        ),
        Positioned(
          bottom: 34, left: 0, right: 0,
          child: Center(
            child: GestureDetector(
              onTap: _capturing ? null : _capture,
              child: Container(
                width: 74, height: 74,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.18),
                  border: Border.all(color: Colors.white, width: 4),
                ),
                child: _capturing
                    ? const Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                    : const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 30),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Draws a translucent surround with a large hand-shaped cut-out outline. The
/// thumb sits on the correct side per hand ([thumbOnLeft]); the palm + fingers
/// are symmetric. Built as a union of simple shapes (no matrix transforms).
class _HandOutlinePainter extends CustomPainter {
  const _HandOutlinePainter({required this.thumbOnLeft});
  final bool thumbOnLeft;

  Path _handPath(Size size) {
    final w = size.width, h = size.height, cx = w / 2;
    final palmW = w * 0.58;
    final palmL = cx - palmW / 2, palmR = cx + palmW / 2;
    final palmTop = h * 0.42, palmBot = h * 0.85;

    Path p = Path()..addRRect(RRect.fromLTRBR(palmL, palmTop, palmR, palmBot, Radius.circular(w * 0.11)));

    // Four fingers (index, middle, ring, little) as vertical capsules; middle is
    // the tallest. They overlap the palm top so the union is one clean silhouette.
    final fw = palmW / 5.2;
    final gap = (palmW - fw * 4) / 3;
    final tips = [h * 0.15, h * 0.085, h * 0.115, h * 0.185];
    for (var i = 0; i < 4; i++) {
      final fx = palmL + fw / 2 + i * (fw + gap);
      p = Path.combine(PathOperation.union, p,
          Path()..addRRect(RRect.fromLTRBR(fx - fw / 2, tips[i], fx + fw / 2, palmTop + fw, Radius.circular(fw / 2))));
    }

    // Thumb: overlapping circles running from the palm's upper side out + down.
    final tr = fw * 0.62;
    final sideX = thumbOnLeft ? palmL : palmR;
    final dir = thumbOnLeft ? -1.0 : 1.0;
    final ptop = palmTop + (palmBot - palmTop) * 0.10;
    final span = palmBot - palmTop;
    final thumbPts = [
      Offset(sideX + dir * tr * 0.1, ptop),
      Offset(sideX + dir * tr * 1.1, ptop + span * 0.22),
      Offset(sideX + dir * tr * 2.0, ptop + span * 0.44),
    ];
    for (final pt in thumbPts) {
      p = Path.combine(PathOperation.union, p, Path()..addOval(Rect.fromCircle(center: pt, radius: tr)));
    }
    return p;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final hand = _handPath(size);
    final dimmed = Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), hand);
    canvas.drawPath(dimmed, Paint()..color = Colors.black.withValues(alpha: 0.5));
    canvas.drawPath(hand, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..color = Colors.white.withValues(alpha: 0.92));
  }

  @override
  bool shouldRepaint(covariant _HandOutlinePainter oldDelegate) => oldDelegate.thumbOnLeft != thumbOnLeft;
}

class _ReviewView extends StatelessWidget {
  const _ReviewView({required this.bytes, required this.hand, required this.onRetake, required this.onUse});
  final Uint8List bytes;
  final String hand;
  final VoidCallback onRetake;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text('${hand == 'left' ? 'Left' : 'Right'} hand',
              style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
        ),
        Expanded(child: Center(child: Image.memory(bytes, fit: BoxFit.contain))),
        Container(
          padding: EdgeInsets.fromLTRB(20, 14, 20, 20 + MediaQuery.of(context).padding.bottom),
          color: Colors.black,
          child: Row(
            children: [
              Expanded(child: OutlinedButton.icon(
                onPressed: onRetake,
                icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                label: const Text('Retake', style: TextStyle(color: Colors.white)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white54), padding: const EdgeInsets.symmetric(vertical: 14)),
              )),
              const SizedBox(width: 12),
              Expanded(child: FilledButton.icon(
                onPressed: onUse,
                icon: const Icon(Icons.check_rounded),
                label: const Text('Use this'),
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              )),
            ],
          ),
        ),
      ],
    );
  }
}

class _AskSecondView extends StatelessWidget {
  const _AskSecondView({required this.onAdd, required this.onSend});
  final VoidCallback onAdd;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.back_hand_rounded, color: Colors.white, size: 54),
            const SizedBox(height: 18),
            const Text('Add your right hand?', textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text(
              'One hand shows what you were born with, the other what you’ve made of it — reading both gives a deeper, more accurate palm reading.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 13.5, height: 1.4),
            ),
            const SizedBox(height: 24),
            SizedBox(width: double.infinity, child: FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add_a_photo_rounded),
              label: const Text('Scan right hand'),
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
            )),
            const SizedBox(height: 10),
            TextButton(
              onPressed: onSend,
              child: const Text('Send with left hand only', style: TextStyle(color: Colors.white70)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onClose});
  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_rounded, color: Colors.white54, size: 48),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 14.5, height: 1.4)),
            const SizedBox(height: 22),
            FilledButton(onPressed: onClose, child: const Text('Close')),
          ],
        ),
      ),
    );
  }
}
