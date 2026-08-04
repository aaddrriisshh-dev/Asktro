import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../../ui/celestial.dart';

final _msgsProvider =
    StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref
      .watch(firestoreProvider)
      .collection('consultations')
      .doc(id)
      .collection('messages')
      .orderBy('timestamp', descending: true)
      .limit(300)
      .snapshots()
      .map((s) => s.docs.map((d) => {'id': d.id, ...d.data()}).toList());
});

/// Read-only transcript of a past consultation — what was said, by whom.
class HistoryChatView extends ConsumerWidget {
  const HistoryChatView({super.key, required this.consultationId, required this.self});
  final String consultationId;
  final Astrologer self;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messages = ref.watch(_msgsProvider(consultationId)).valueOrNull ?? const [];
    return Scaffold(
      backgroundColor: Sky.bg,
      appBar: AppBar(
        backgroundColor: Sky.card,
        surfaceTintColor: Sky.card,
        elevation: 0,
        foregroundColor: Sky.ink,
        title: Text('Consultation transcript', style: Sky.h2.copyWith(fontSize: 16)),
      ),
      body: messages.isEmpty
          ? Center(child: Text('No messages in this consultation.', style: Sky.label))
          : ListView.builder(
              reverse: true,
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).padding.bottom),
              itemCount: messages.length,
              itemBuilder: (_, i) {
                final m = messages[i];
                final mine = m['senderId'] == self.id;
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
                                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined),),
                          )
                        : Text((m['text'] ?? '') as String,
                            style: Sky.body.copyWith(fontSize: 14, color: mine ? Colors.white : Sky.ink),),
                  ),
                );
              },
            ),
    );
  }
}
