// Standalone UI preview — runs WITHOUT Firebase or keys, using the real ZODIA
// design system (shared_flutter) with in-memory sample data. Purpose: see the
// basic look and feel on a device/Chrome before the backend is wired.
//
//   flutter run -t lib/preview.dart -d chrome
//
// This is a preview harness only; the production entry point is main.dart.
import 'package:flutter/material.dart';
import 'package:shared_flutter/shared_flutter.dart';

void main() => runApp(const PreviewApp());

class PreviewApp extends StatelessWidget {
  const PreviewApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZODIA Preview',
      debugShowCheckedModeBanner: false,
      theme: ZodiaTheme.light(),
      home: const _PreviewShell(),
    );
  }
}

// Sample astrologers (display only).
final _samples = <Astrologer>[
  const Astrologer(
    id: '1', name: 'Rhea Sharma', about: 'Vedic astrologer with 8 years of guiding clients.',
    experience: 8, rating: 4.9, totalReviews: 312, followers: 1240, totalConsultations: 1204,
    languages: ['Hindi', 'English'], expertise: ['Vedic', 'Relationships'],
    onlineStatus: true, available: true, verified: true, featured: true,
    status: AstrologerStatus.approved,
  ),
  const Astrologer(
    id: '2', name: 'Vikram Kapoor', about: 'Tarot and career specialist.',
    experience: 6, rating: 4.8, totalReviews: 188, followers: 640, totalConsultations: 720,
    languages: ['English', 'Punjabi'], expertise: ['Tarot', 'Career'],
    onlineStatus: true, available: true, verified: true, status: AstrologerStatus.approved,
  ),
];

class _PreviewShell extends StatefulWidget {
  const _PreviewShell();
  @override
  State<_PreviewShell> createState() => _PreviewShellState();
}

class _PreviewShellState extends State<_PreviewShell> {
  int _i = 0;
  late final _tabs = [
    const _HomePreview(),
    const _ChatPreview(),
    const _WalletPreview(),
    const _ProfilePreview(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: _tabs[_i]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        height: 66,
        onDestinationSelected: (v) => setState(() => _i = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

class _HomePreview extends StatelessWidget {
  const _HomePreview();
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Good Evening', style: AppTypography.caption),
                  Text('Adrish 👋', style: AppTypography.title),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
              decoration: BoxDecoration(color: AppColors.accentLavender, borderRadius: BorderRadius.circular(AppRadius.chip)),
              child: Row(children: [
                const Icon(Icons.account_balance_wallet, size: 18, color: AppColors.primary),
                const SizedBox(width: 6),
                Text(Money.formatPaise(64000), style: AppTypography.body.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
              ],),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: const BoxDecoration(color: AppColors.card, borderRadius: AppRadius.searchR, boxShadow: AppShadows.soft),
          child: const Row(children: [
            Icon(Icons.search, color: AppColors.textSecondary),
            SizedBox(width: 8),
            Text('Search astrologers...', style: TextStyle(color: AppColors.textSecondary)),
          ],),
        ),
        const SizedBox(height: AppSpacing.lg),
        GradientCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Weekend Bonus', style: AppTypography.subtitle.copyWith(color: Colors.white)),
              const SizedBox(height: 4),
              Text('Recharge ₹499, get ₹150 extra', style: AppTypography.caption.copyWith(color: Colors.white70)),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        Text('Online Now', style: AppTypography.subtitle),
        const SizedBox(height: AppSpacing.sm),
        ..._samples.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: _SampleAstroCard(a: a),
            ),),
      ],
    );
  }
}

class _SampleAstroCard extends StatelessWidget {
  const _SampleAstroCard({required this.a});
  final Astrologer a;
  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          Row(
            children: [
              AppAvatar(name: a.name, size: 56, showPresence: true, online: a.onlineStatus),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(child: Text(a.name, style: AppTypography.subtitle, overflow: TextOverflow.ellipsis)),
                      if (a.verified) ...[const SizedBox(width: 6), const VerifiedBadge()],
                    ],),
                    Text(a.expertise.join(' • '), style: AppTypography.caption),
                    Row(children: [
                      const Icon(Icons.star_rounded, size: 16, color: AppColors.warning),
                      Text(' ${a.rating} · ${a.experience}y exp', style: AppTypography.caption),
                    ],),
                  ],
                ),
              ),
              const LabelBadge(text: '₹9/min', filled: false),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(spacing: 6, children: a.languages.map((l) => TagChip(l)).toList()),
        ],
      ),
    );
  }
}

class _ChatPreview extends StatelessWidget {
  const _ChatPreview();
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: const BoxDecoration(color: AppColors.card, boxShadow: AppShadows.soft),
          child: Row(children: [
            const AppAvatar(name: 'Rhea Sharma', size: 40),
            const SizedBox(width: 10),
            Text('Rhea Sharma', style: AppTypography.body.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(width: 4),
            const VerifiedBadge(size: 14),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14)),
              child: Text('⏱ 01:58', style: AppTypography.body.copyWith(color: AppColors.warning, fontWeight: FontWeight.w700)),
            ),
          ],),
        ),
        const Expanded(
          child: Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Column(
              children: [
                _Bubble('Namaste 🙏 Please share your birth details.', false),
                _Bubble('14 Aug 1996, 6:20 AM, Kolkata', true),
                _Bubble('Your Jupiter transit looks favourable this month…', false),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: PrimaryButton(
            label: 'Show low-balance popup',
            onPressed: () => showLowBalanceDialog(context, remainingSec: 118),
          ),
        ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.text, this.mine);
  final String text;
  final bool mine;
  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          gradient: mine ? AppColors.primaryGradient : null,
          color: mine ? null : AppColors.card,
          borderRadius: BorderRadius.circular(16),
          boxShadow: mine ? null : AppShadows.soft,
        ),
        child: Text(text, style: AppTypography.body.copyWith(color: mine ? Colors.white : AppColors.textDark)),
      ),
    );
  }
}

class _WalletPreview extends StatelessWidget {
  const _WalletPreview();
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text('Wallet', style: AppTypography.subtitle),
        const SizedBox(height: AppSpacing.md),
        GradientCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Available balance', style: AppTypography.caption.copyWith(color: Colors.white70)),
              const SizedBox(height: 6),
              AnimatedBalance(paise: 64000, style: AppTypography.headline.copyWith(color: Colors.white)),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('₹499', style: AppTypography.title),
            Text('+ ₹150 bonus', style: AppTypography.caption.copyWith(color: AppColors.success)),
          ],),),
          const LabelBadge(text: 'Recommended'),
        ],),),
        const SizedBox(height: AppSpacing.sm),
        AppCard(child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('₹199', style: AppTypography.title),
            Text('+ ₹30 bonus', style: AppTypography.caption.copyWith(color: AppColors.success)),
          ],),),
          const LabelBadge(text: 'Popular', filled: false),
        ],),),
      ],
    );
  }
}

class _ProfilePreview extends StatelessWidget {
  const _ProfilePreview();
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(children: [
          const AppAvatar(name: 'Adrish M', size: 64),
          const SizedBox(width: AppSpacing.lg),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Adrish', style: AppTypography.subtitle),
            Text('+91 90000 00000', style: AppTypography.caption),
          ],),
        ],),
        const SizedBox(height: AppSpacing.xl),
        const EmptyState(
          icon: Icons.card_giftcard_rounded,
          title: 'Refer & earn',
          message: 'Share your code ASK1234 and both get bonus wallet credit.',
        ),
      ],
    );
  }
}
