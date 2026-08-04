import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import 'chat_consultation_screen.dart';

/// Loads a consultation + its astrologer by id, then opens the chat. Used when a
/// notification — an in-app tap OR a phone push — deep-links to a specific chat
/// (`asktro://chat/<consultationId>`). Shows a spinner while loading and a
/// friendly fallback if the conversation can't be found.
final _consultationDocProvider =
    StreamProvider.autoDispose.family<Consultation?, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(id)
      .snapshots()
      .map((d) => d.exists ? Consultation.fromMap(d.id, d.data()!) : null);
});

final _chatAstrologerProvider =
    FutureProvider.autoDispose.family<Astrologer?, String>((ref, id) async {
  try {
    return await ref.watch(astrologerRepositoryProvider).watchOne(id).first;
  } catch (_) {
    return null;
  }
});

class ChatDeepLinkScreen extends ConsumerWidget {
  const ChatDeepLinkScreen({super.key, required this.consultationId});
  final String consultationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cAsync = ref.watch(_consultationDocProvider(consultationId));
    return cAsync.when(
      loading: () => const _Loading(),
      error: (_, __) => const _Missing(),
      data: (c) {
        if (c == null) return const _Missing();
        final aAsync = ref.watch(_chatAstrologerProvider(c.astrologerId));
        return aAsync.when(
          loading: () => const _Loading(),
          error: (_, __) => const _Missing(),
          data: (astro) {
            if (astro == null) return const _Missing();
            return ChatConsultationScreen(
              consultationId: consultationId,
              astrologer: astro,
              readOnly: c.status.isTerminal,
            );
          },
        );
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
}

class _Missing extends StatelessWidget {
  const _Missing();
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('This conversation is no longer available.')),
      );
}
