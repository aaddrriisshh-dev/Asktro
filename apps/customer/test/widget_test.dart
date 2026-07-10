// Real unit tests for the shared Consultation model parsing — the client's
// authoritative read of a live session. Booting the full app needs Firebase, so
// widget-booting isn't done here, but this exercises actual product logic
// (including the networkStatus field the disconnect auto-resume relies on).

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_flutter/shared_flutter.dart';

void main() {
  group('Consultation.fromMap', () {
    test('parses core fields', () {
      final c = Consultation.fromMap('c1', const {
        'customerId': 'u1',
        'astrologerId': 'a1',
        'type': 'chat',
        'status': 'active',
        'pricePerMinute': 2500,
        'billedSeconds': 30,
        'totalCharged': 1250,
        'remainingSec': 120,
        'warnLevel': 1,
        'networkStatus': 'reconnecting',
      });
      expect(c.id, 'c1');
      expect(c.customerId, 'u1');
      expect(c.astrologerId, 'a1');
      expect(c.status, ConsultationStatus.active);
      expect(c.pricePerMinute, 2500);
      expect(c.remainingSec, 120);
      expect(c.warnLevel, 1);
      expect(c.networkStatus, 'reconnecting');
    });

    test('applies safe defaults for missing fields', () {
      final c = Consultation.fromMap('c2', const {'type': 'chat', 'status': 'waiting'});
      expect(c.status, ConsultationStatus.waiting);
      expect(c.networkStatus, 'ok'); // defaults to ok
      expect(c.totalCharged, 0);
      expect(c.remainingSec, 0);
      expect(c.warnLevel, 0);
    });
  });
}
