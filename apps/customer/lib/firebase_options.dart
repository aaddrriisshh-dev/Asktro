// GENERATED-STYLE PLACEHOLDER — replace by running `flutterfire configure`
// once the Firebase project exists (see docs/SETUP_CHECKLIST.md §1). Values are
// read from the owner-supplied Firebase web/android/ios app configs. No real
// secrets are committed here.
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
        throw UnsupportedError('Unsupported platform. Run flutterfire configure.');
    }
  }

  // Owner: replace the placeholder values via `flutterfire configure`.
  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'REPLACE_WEB_API_KEY',
    appId: 'REPLACE_WEB_APP_ID',
    messagingSenderId: 'REPLACE_SENDER_ID',
    projectId: 'REPLACE_PROJECT_ID',
    authDomain: 'REPLACE_PROJECT.firebaseapp.com',
    storageBucket: 'REPLACE_PROJECT.appspot.com',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'REPLACE_ANDROID_API_KEY',
    appId: 'REPLACE_ANDROID_APP_ID',
    messagingSenderId: 'REPLACE_SENDER_ID',
    projectId: 'REPLACE_PROJECT_ID',
    storageBucket: 'REPLACE_PROJECT.appspot.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'REPLACE_IOS_API_KEY',
    appId: 'REPLACE_IOS_APP_ID',
    messagingSenderId: 'REPLACE_SENDER_ID',
    projectId: 'REPLACE_PROJECT_ID',
    storageBucket: 'REPLACE_PROJECT.appspot.com',
    iosBundleId: 'com.asktro.customer',
  );
}
