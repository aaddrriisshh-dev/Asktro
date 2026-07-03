# App launcher icon

Drop your square app icon here as **`app_icon.png`** (this exact filename).

Requirements:
- **1024×1024 px**, PNG.
- Square. If your logo is wide (like the wordmark), letterbox/crop it into a
  square emblem first — a wide image will look tiny in the round launcher mask.
- A transparent background is fine; the adaptive-icon background color
  (`#F5F2FF`, matching the splash) is applied behind it on Android 8+.

Then generate the native icons (on your Mac, where `android/` and `ios/` live):

```bash
cd apps/customer
flutter pub get
dart run flutter_launcher_icons
```

This overwrites the default Flutter "blue arrow" icon in
`android/app/src/main/res/mipmap-*/` and `ios/Runner/Assets.xcassets/`.
Commit those generated files afterward so the icon ships in every build.

Config lives in `apps/customer/pubspec.yaml` under `flutter_launcher_icons:`.
