import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Guided palm capture. Shows a live camera with a hand-shaped outline the user
/// aligns their palm into (so the lines come out framed + in focus → a better
/// reading), captures the dominant hand, then offers an optional second hand for
/// a deeper two-hand comparison. Returns the captured image bytes (1 or 2) via
/// Navigator.pop, in the order taken — the chat then stages + sends them.
///
/// Defensive by design: a denied permission or a camera-init failure shows a
/// clear message with a way out, never a crash. Requires a device rebuild
/// (adds the `camera` package).
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
  Uint8List? _review; // a just-taken shot awaiting Retake/Use
  bool _askSecond = false; // showing the "add other hand?" prompt

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
      // Prefer the back camera (better for a palm); fall back to the first.
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
    // Release the camera when backgrounded; re-init on resume.
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

  void _addSecond() => setState(() => _askSecond = false);

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
                  ? _ReviewView(bytes: _review!, onRetake: _retake, onUse: _useShot)
                  : _askSecond
                      ? _AskSecondView(onAdd: _addSecond, onSend: _sendWithOne)
                      : _cameraView(),
    );
  }

  Widget _cameraView() {
    final second = _captured.length == 1;
    return Stack(
      fit: StackFit.expand,
      children: [
        Center(child: CameraPreview(_controller!)),
        // Hand outline + dimmed surround.
        const Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _HandOutlinePainter()))),
        // Instruction.
        Positioned(
          top: 18, left: 20, right: 20,
          child: Column(
            children: [
              Text(
                second ? 'Now your OTHER hand' : 'Place your dominant hand in the outline',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700,
                    shadows: [Shadow(blurRadius: 6, color: Colors.black)]),
              ),
              const SizedBox(height: 4),
              Text(
                second ? 'For a deeper, two-hand reading' : 'Fingers spread, palm facing the camera, good light',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 12.5,
                    shadows: [Shadow(blurRadius: 6, color: Colors.black)]),
              ),
            ],
          ),
        ),
        // Capture button.
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

/// Draws a translucent surround with a hand-shaped cut-out outline in the centre.
class _HandOutlinePainter extends CustomPainter {
  const _HandOutlinePainter();

  Path _handPath(Size size) {
    final w = size.width, h = size.height;
    final cx = w / 2;
    final palmW = w * 0.5;
    final path = Path();
    // Palm as a rounded rectangle.
    final palmTop = h * 0.46, palmBottom = h * 0.80;
    final palmRect = RRect.fromLTRBR(
      cx - palmW / 2, palmTop, cx + palmW / 2, palmBottom, const Radius.circular(46),
    );
    path.addRRect(palmRect);
    // Four fingers as capsules above the palm.
    final fingerW = palmW / 5.2;
    final gap = (palmW - fingerW * 4) / 3;
    final startX = cx - palmW / 2 + fingerW / 2;
    final fingerTops = [h * 0.20, h * 0.16, h * 0.19, h * 0.25];
    for (var i = 0; i < 4; i++) {
      final fx = startX + i * (fingerW + gap);
      final top = fingerTops[i];
      path.addRRect(RRect.fromLTRBR(
        fx - fingerW / 2, top, fx + fingerW / 2, palmTop + 16, Radius.circular(fingerW / 2),
      ));
    }
    // Thumb as a capsule off the lower-left of the palm (kept axis-aligned so the
    // outline needs no matrix transform — it's only an alignment guide).
    path.addRRect(RRect.fromLTRBR(
      cx - palmW / 2 - fingerW * 0.55, h * 0.54, cx - palmW / 2 + fingerW * 0.55, h * 0.72,
      Radius.circular(fingerW / 2),
    ));
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final hand = _handPath(size);
    // Dim everything outside the hand.
    final overlay = Path()..addRect(Offset.zero & size);
    final dimmed = Path.combine(PathOperation.difference, overlay, hand);
    canvas.drawPath(dimmed, Paint()..color = Colors.black.withValues(alpha: 0.45));
    // Outline the hand.
    canvas.drawPath(hand, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..color = Colors.white.withValues(alpha: 0.9));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ReviewView extends StatelessWidget {
  const _ReviewView({required this.bytes, required this.onRetake, required this.onUse});
  final Uint8List bytes;
  final VoidCallback onRetake;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
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
            const Text('Add your other hand?', textAlign: TextAlign.center,
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
              label: const Text('Add other hand'),
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
            )),
            const SizedBox(height: 10),
            TextButton(
              onPressed: onSend,
              child: const Text('Send with one hand', style: TextStyle(color: Colors.white70)),
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
