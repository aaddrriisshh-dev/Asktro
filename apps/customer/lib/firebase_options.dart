// Firebase configuration for the ASKTRO customer app.
// Android values are the real project config (asktro-tech-provate-limited).
// iOS/Web reuse the same project; register dedicated apps before shipping there.
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        return android;
    }
  }

  static const String _apiKey = 'AIzaSyDTgJRhfYDXivkNOzPkSBi6ysW9osb4f0A';
  static const String _projectId = 'asktro-tech-provate-limited';
  static const String _sender = '234450497443';
  static const String _bucket = 'asktro-tech-provate-limited.firebasestorage.app';

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: _apiKey,
    appId: '1:234450497443:android:082535cecdff8711ef3416',
    messagingSenderId: _sender,
    projectId: _projectId,
    storageBucket: _bucket,
  );

  // Placeholder until dedicated iOS/Web apps are registered in Firebase.
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: _apiKey,
    appId: '1:234450497443:android:082535cecdff8711ef3416',
    messagingSenderId: _sender,
    projectId: _projectId,
    storageBucket: _bucket,
    iosBundleId: 'com.example.asktroCustomer',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: _apiKey,
    appId: '1:234450497443:android:082535cecdff8711ef3416',
    messagingSenderId: _sender,
    projectId: _projectId,
    authDomain: 'asktro-tech-provate-limited.firebaseapp.com',
    storageBucket: _bucket,
  );
}
