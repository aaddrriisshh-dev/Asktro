import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'router.dart';

class AsktroAstrologerApp extends ConsumerWidget {
  const AsktroAstrologerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'ASKTRO for Astrologers',
      debugShowCheckedModeBanner: false,
      theme: AsktroTheme.light(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
