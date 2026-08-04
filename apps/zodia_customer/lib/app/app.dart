import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_flutter/shared_flutter.dart';

import 'router.dart';
import 'connectivity.dart';

class ZodiaCustomerApp extends ConsumerWidget {
  const ZodiaCustomerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'ZODIA',
      debugShowCheckedModeBanner: false,
      theme: ZodiaTheme.light(),
      routerConfig: router,
      builder: (context, child) => ConnectivityBanner(child: child ?? const SizedBox.shrink()),
    );
  }
}
