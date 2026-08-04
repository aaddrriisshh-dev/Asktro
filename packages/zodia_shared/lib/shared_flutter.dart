/// ZODIA shared Flutter package — design system, models, utilities, and
/// service interfaces used by both the customer and astrologer apps.
library shared_flutter;

// Theme / design system
export 'src/theme/app_colors.dart';
export 'src/theme/app_dimens.dart';
export 'src/theme/app_typography.dart';
export 'src/theme/app_theme.dart';

// Widgets
export 'src/widgets/app_buttons.dart';
export 'src/widgets/app_card.dart';
export 'src/widgets/badges.dart';
export 'src/widgets/ai_badge.dart';
export 'src/widgets/app_avatar.dart';
export 'src/widgets/app_logo.dart';
export 'src/widgets/shimmer.dart';
export 'src/widgets/state_views.dart';
export 'src/widgets/low_balance_dialog.dart';
export 'src/widgets/grace_bonus_dialog.dart';
export 'src/widgets/animated_balance.dart';
export 'src/widgets/call_video_view.dart';

// Models
export 'src/models/enums.dart';
export 'src/models/astrologer.dart';
export 'src/models/consultation.dart';
export 'src/models/user_profile.dart';
export 'src/models/catalog.dart';
export 'src/models/promo_theme.dart';

// Utils
export 'src/utils/money.dart';
export 'src/utils/result.dart';

// Service interfaces
export 'src/services/service_interfaces.dart';
export 'src/services/call_engine.dart';

// Agora RTC types re-exported so screens can drive the call engine without a
// direct dependency on the plugin.
export 'package:agora_rtc_engine/agora_rtc_engine.dart' show RtcEngine;
