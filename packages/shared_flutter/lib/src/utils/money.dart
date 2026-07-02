import 'package:intl/intl.dart';

/// Money helpers mirroring the backend. All balances travel as integer **paise**
/// so the client and Cloud Functions format money identically and never drift.
abstract final class Money {
  static const int paisePerRupee = 100;
  static const int secondsPerMinute = 60;

  static final NumberFormat _inr = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 0,
  );

  /// Whole-rupee display for balances/plans, e.g. 11900 → "₹119".
  static String formatPaise(int paise) => _inr.format(paise / paisePerRupee);

  /// Two-decimal display where precision matters (receipts), e.g. "₹119.00".
  static String formatPaisePrecise(int paise) {
    final f = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
    return f.format(paise / paisePerRupee);
  }

  static double paiseToRupees(int paise) => paise / paisePerRupee;
  static int rupeesToPaise(num rupees) => (rupees * paisePerRupee).round();

  /// Seconds of talk-time a spendable balance affords at a per-minute price.
  static int affordableSeconds(int spendablePaise, int pricePerMinutePaise) {
    if (pricePerMinutePaise <= 0) return 0;
    final pps = pricePerMinutePaise / secondsPerMinute;
    return (spendablePaise / pps).floor();
  }

  /// mm:ss formatting for the consultation timer.
  static String formatDuration(int seconds) {
    final s = seconds < 0 ? 0 : seconds;
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  /// Human duration for history rows, e.g. "12m 04s" or "1h 03m".
  static String formatDurationLong(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    if (h > 0) return '${h}h ${m.toString().padLeft(2, '0')}m';
    return '${m}m ${s.toString().padLeft(2, '0')}s';
  }
}
