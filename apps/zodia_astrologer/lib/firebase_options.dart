// Generated for the Zodia Astrologer app from the project's
// google-services.json (project: asktro-tech-provate-limited). Android is the
// active target; other platforms throw until a matching app is registered.
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'DefaultFirebaseOptions have not been configured for web.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for iOS — '
          'register an iOS app (com.example.asktroAstrologer) in the Firebase '
          'console and add its values here.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDTgJRhfYDXivkNOzPkSBi6ysW9osb4f0A',
    appId: '1:234450497443:android:db9b7956f99ffc88ef3416',
    messagingSenderId: '234450497443',
    projectId: 'asktro-tech-provate-limited',
    storageBucket: 'asktro-tech-provate-limited.firebasestorage.app',
  );
}
