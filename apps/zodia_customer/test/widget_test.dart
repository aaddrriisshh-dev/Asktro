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

    test('parses double-valued money fields without throwing (Firestore may send 900.0)', () {
      // Firestore can return an integer-valued field as a double. A bare `as int`
      // would throw here and crash the live consultation screen mid-session.
      final c = Consultation.fromMap('c3', const {
        'type': 'chat', 'status': 'active',
        'pricePerMinute': 900.0, 'billedSeconds': 30.0, 'totalCharged': 450.0,
        'walletAfter': 1234.0, 'remainingSec': 60.0, 'warnLevel': 2.0, 'duration': 30.0,
      });
      expect(c.pricePerMinute, 900);
      expect(c.totalCharged, 450);
      expect(c.walletAfter, 1234);
      expect(c.remainingSec, 60);
      expect(c.warnLevel, 2);
    });
  });
}
