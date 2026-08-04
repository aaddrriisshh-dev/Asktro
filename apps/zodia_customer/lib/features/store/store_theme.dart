import 'package:flutter/material.dart';

/// Zodia Mall's "ghee-gold" identity — a warm, premium world that stands apart
/// from the app's lavender while staying cohesive with Zodia's serif-and-gold
/// taste. Used across the home rail and every store screen.
abstract final class Mall {
  // Ghee golds
  static const Color cream = Color(0xFFEFF2F7);
  static const Color light = Color(0xFFF7E6B4);
  static const Color gold = Color(0xFFCED4DE);
  static const Color deep = Color(0xFFAAB2C0);
  static const Color goldInk = Color(0xFF5A6274);
  static const Color goldLine = Color(0xFFCED4DE);

  // Ink / neutrals on the warm ground
  static const Color ink = Color(0xFF3A2E17);
  static const Color warmGrey = Color(0xFF8C7A57);
  static const Color titleBrown = Color(0xFF5A3D0C);

  // App-cohesive
  static const Color navy = Color(0xFF141C38);
  static const Color card = Color(0xFFFFFFFF);
  static const Color hair = Color(0xFFEFE7D6);

  // Commerce semantics
  static const Color green = Color(0xFF1E9E63);
  static const Color mrp = Color(0xFFA6A0AE);
  static const Color offBg = Color(0xFFFCE6DE);
  static const Color offInk = Color(0xFFC4562E);

  /// The signature ghee-gold gradient (rail + section grounds).
  static const LinearGradient gheeGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEFF2F7), Color(0xFFF7E6B4), Color(0xFFEFCE85), Color(0xFFE7BE68)],
    stops: [0, .42, .78, 1],
  );

  /// Deep-brown gold gradient for the store's category banner.
  static const LinearGradient bannerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3A2A12), Color(0xFF6A4718), Color(0xFF8A5C1E)],
    stops: [0, .6, 1],
  );

  /// Solid gold pill gradient (Visit Store, primary CTAs).
  static const LinearGradient goldButton = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF8A5A10), Color(0xFFC8871A)],
  );

  /// Navy add-to-cart gradient.
  static const LinearGradient navyButton = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF141C38), Color(0xFF4A3A7A)],
  );

  /// Format paise → "₹1,499".
  static String rupees(int paise) {
    final r = (paise / 100).round();
    final s = r.toString();
    // Indian grouping (last 3, then pairs).
    if (s.length <= 3) return '₹$s';
    final head = s.substring(0, s.length - 3);
    final tail = s.substring(s.length - 3);
    final buf = StringBuffer();
    for (var i = 0; i < head.length; i++) {
      final fromEnd = head.length - i;
      buf.write(head[i]);
      if (fromEnd > 1 && fromEnd % 2 == 1) buf.write(',');
    }
    return '₹$buf,$tail';
  }
}

/// A soft rounded product-image placeholder shown until a real photo loads or
/// when a product has no image yet. Warm ghee tint + a shopping glyph.
class MallImagePlaceholder extends StatelessWidget {
  const MallImagePlaceholder({super.key, this.size = 48, this.radius = 16});
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFAF4E6), Color(0xFFEFE3C8)],
        ),
      ),
      child: Center(
        child: Icon(Icons.diamond_outlined, size: size, color: Mall.deep.withValues(alpha: 0.55)),
      ),
    );
  }
}
