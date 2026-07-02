import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import '../../app/providers.dart';
import '../astrologer/astrologer_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  List<Astrologer> _results = const [];
  bool _loading = false;
  bool _searched = false;

  Future<void> _run(String q) async {
    setState(() => _loading = true);
    final results = await ref.read(astrologerRepositoryProvider).search(q);
    if (!mounted) return;
    setState(() {
      _results = results;
      _loading = false;
      _searched = true;
    });
  }

  @override
  void initState() {
    super.initState();
    _run('');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onSubmitted: _run,
          onChanged: (v) {
            if (v.isEmpty) _run('');
          },
          decoration: const InputDecoration(
            hintText: 'Search astrologers...',
            border: InputBorder.none,
            filled: false,
          ),
        ),
      ),
      body: _loading
          ? ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.lg),
              itemCount: 5,
              itemBuilder: (_, __) => const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md),
                child: AstrologerCardSkeleton(),
              ),
            )
          : _results.isEmpty && _searched
              ? const EmptyState(
                  icon: Icons.search_off_rounded,
                  title: 'No astrologers found',
                  message: 'Try a different name, language, or specialization.',
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  itemCount: _results.length,
                  itemBuilder: (_, i) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: AstrologerCard(astrologer: _results[i]),
                  ),
                ),
    );
  }
}
