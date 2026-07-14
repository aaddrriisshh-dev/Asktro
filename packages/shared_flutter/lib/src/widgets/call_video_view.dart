import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/material.dart';

import '../services/call_engine.dart';

/// Renders a live video call: the remote participant fills the screen, with the
/// local camera shown as a small picture-in-picture in the top-right. Driven by
/// a [CallEngine]; shows a calm placeholder until the peer's video arrives.
class CallVideoView extends StatelessWidget {
  const CallVideoView({super.key, required this.call});
  final CallEngine call;

  @override
  Widget build(BuildContext context) {
    final rtc = call.engine;
    if (rtc == null) {
      return const ColoredBox(color: Color(0xFF2A1E52));
    }
    final topInset = MediaQuery.of(context).padding.top;
    return Stack(
      children: [
        // Remote participant, full-screen.
        Positioned.fill(
          child: (call.remoteJoined && call.remoteUid != null && call.channel != null)
              ? AgoraVideoView(
                  controller: VideoViewController.remote(
                    rtcEngine: rtc,
                    canvas: VideoCanvas(uid: call.remoteUid),
                    connection: RtcConnection(channelId: call.channel),
                  ),
                )
              : const ColoredBox(color: Color(0xFF2A1E52)),
        ),
        // Local self-preview, small rounded card in the top-right.
        Positioned(
          top: topInset + 12,
          right: 14,
          width: 108,
          height: 150,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: call.cameraOn
                ? AgoraVideoView(
                    controller: VideoViewController(
                      rtcEngine: rtc,
                      canvas: const VideoCanvas(uid: 0),
                    ),
                  )
                : const ColoredBox(color: Colors.black54),
          ),
        ),
      ],
    );
  }
}
