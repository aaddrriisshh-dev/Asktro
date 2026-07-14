import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../profile_setup/onboarding_style.dart';

/// A published journal article, authored in the admin portal.
class Blog {
  const Blog({
    required this.id,
    required this.title,
    required this.excerpt,
    required this.content,
    required this.coverImage,
    this.author,
    this.createdAt,
    this.views = 0,
  });

  final String id;
  final String title;
  final String excerpt;
  final String content;
  final String coverImage;
  final String? author;
  final DateTime? createdAt;

  /// Display-only view count typed by an admin in the portal (not real traffic).
  final int views;

  factory Blog.fromDoc(String id, Map<String, dynamic> m) => Blog(
        id: id,
        title: (m['title'] ?? '') as String,
        excerpt: (m['excerpt'] ?? '') as String,
        content: (m['content'] ?? '') as String,
        coverImage: (m['coverImage'] ?? '') as String,
        author: m['author'] as String?,
        createdAt: (m['createdAt'] as Timestamp?)?.toDate(),
        views: (m['views'] as num?)?.toInt() ?? 0,
      );

  int get readMinutes {
    final words = content.trim().isEmpty ? 0 : content.trim().split(RegExp(r'\s+')).length;
    final m = (words / 200).ceil();
    return m < 1 ? 1 : m;
  }
}

/// The latest published blogs, newest first (backed by the blogs composite index).
final recentBlogsProvider = StreamProvider.autoDispose<List<Blog>>((ref) {
  return FirebaseFirestore.instance
      .collection('blogs')
      .where('published', isEqualTo: true)
      .orderBy('createdAt', descending: true)
      .limit(10)
      .snapshots()
      .map((s) => s.docs.map((d) => Blog.fromDoc(d.id, d.data())).toList());
});

/// Every published blog, newest first — backs the "View all" full-list screen.
final allBlogsProvider = StreamProvider.autoDispose<List<Blog>>((ref) {
  return FirebaseFirestore.instance
      .collection('blogs')
      .where('published', isEqualTo: true)
      .orderBy('createdAt', descending: true)
      .limit(100)
      .snapshots()
      .map((s) => s.docs.map((d) => Blog.fromDoc(d.id, d.data())).toList());
});

/// Formats a view count like "131,889".
String _viewCount(int n) => NumberFormat.decimalPattern('en_US').format(n);

/// The home-screen "From the Asktro Journal" rail. Sits on its own tinted band
/// so it reads as a distinct section, separate from the astrologer carousels.
/// Renders nothing when there are no published blogs.
class RecentBlogsSection extends ConsumerWidget {
  const RecentBlogsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blogs = ref.watch(recentBlogsProvider).valueOrNull ?? const <Blog>[];
    if (blogs.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(vertical: 22),
      decoration: const BoxDecoration(
        color: Color(0xFFF1EAFB),
        border: Border(
          top: BorderSide(color: Ob.border),
          bottom: BorderSide(color: Ob.border),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(
              children: [
                const Icon(Icons.menu_book_rounded, size: 18, color: Ob.goldDeep),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('From the Asktro Journal',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.cormorantGaramond(fontSize: 22, fontWeight: FontWeight.w700, color: Ob.navy),),
                ),
                GestureDetector(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const AllBlogsScreen()),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('View all',
                          style: Ob.note.copyWith(color: Ob.purpleDeep, fontWeight: FontWeight.w700, fontSize: 13),),
                      const Icon(Icons.chevron_right_rounded, size: 18, color: Ob.purpleDeep),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 3),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Text('Recent reads for you', style: Ob.note.copyWith(color: Ob.grey)),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 262,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              itemCount: blogs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 14),
              itemBuilder: (_, i) => _BlogCard(blog: blogs[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _BlogCard extends StatelessWidget {
  const _BlogCard({required this.blog});
  final Blog blog;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => BlogReaderScreen(blog: blog)),
      ),
      child: Container(
        width: 262,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFD8C9F2), width: 1.3),
          boxShadow: Ob.softShadow,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                SizedBox(
                  height: 132,
                  width: double.infinity,
                  child: _cover(blog.coverImage),
                ),
                if (blog.views > 0)
                  Positioned(top: 10, right: 10, child: _viewsPill(blog.views)),
              ],
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(blog.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Ob.option.copyWith(fontWeight: FontWeight.w700, height: 1.25, fontSize: 15),),
                    const SizedBox(height: 5),
                    Expanded(
                      child: Text(blog.excerpt,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Ob.note.copyWith(color: Ob.grey, height: 1.35, fontSize: 12.5),),
                    ),
                    Row(
                      children: [
                        Text('Read more', style: Ob.note.copyWith(color: Ob.purpleDeep, fontWeight: FontWeight.w800, fontSize: 12.5)),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_forward_rounded, size: 14, color: Ob.purpleDeep),
                        const Spacer(),
                        const Icon(Icons.schedule_rounded, size: 13, color: Ob.grey),
                        const SizedBox(width: 3),
                        Text('${blog.readMinutes} min',
                            style: Ob.note.copyWith(color: Ob.grey, fontWeight: FontWeight.w600, fontSize: 11.5),),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Widget _cover(String url) {
  if (url.isEmpty) {
    return Container(
      decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF5E3FBE), Color(0xFF7E57C2)])),
      child: const Center(child: Icon(Icons.auto_stories_rounded, color: Colors.white, size: 34)),
    );
  }
  return Image.network(
    url,
    fit: BoxFit.cover,
    errorBuilder: (_, __, ___) => Container(color: Ob.lavenderChip),
    loadingBuilder: (ctx, child, progress) =>
        progress == null ? child : Container(color: Ob.lavenderChip, child: const Center(child: CircularProgressIndicator(strokeWidth: 2, color: Ob.purple))),
  );
}

/// The eye-icon + count pill shown on the top-right of a blog cover.
Widget _viewsPill(int views) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.remove_red_eye_rounded, size: 12, color: Colors.white),
        const SizedBox(width: 4),
        Text(_viewCount(views),
            style: Ob.note.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11),),
      ],
    ),
  );
}

/// Full-screen "View all" list of every published blog (newest first).
class AllBlogsScreen extends ConsumerWidget {
  const AllBlogsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(allBlogsProvider);
    return Scaffold(
      backgroundColor: Ob.bgColor,
      appBar: AppBar(
        backgroundColor: Ob.bgColor,
        foregroundColor: Ob.navy,
        elevation: 0,
        title: Text('Asktro Journal',
            style: GoogleFonts.cormorantGaramond(fontSize: 24, fontWeight: FontWeight.w700, color: Ob.navy),),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Ob.purple)),
        error: (_, __) => const Center(child: Text('Could not load articles.')),
        data: (blogs) => blogs.isEmpty
            ? const Center(child: Text('No articles yet.'))
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                itemCount: blogs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 14),
                itemBuilder: (_, i) => _BlogListRow(blog: blogs[i]),
              ),
      ),
    );
  }
}

/// One full-width row in the "View all" list: thumbnail left, text right.
class _BlogListRow extends StatelessWidget {
  const _BlogListRow({required this.blog});
  final Blog blog;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => BlogReaderScreen(blog: blog)),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFD8C9F2), width: 1.3),
          boxShadow: Ob.softShadow,
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Stack(
                children: [
                  SizedBox(width: 118, height: double.infinity, child: _cover(blog.coverImage)),
                  if (blog.views > 0)
                    Positioned(top: 8, left: 8, child: _viewsPill(blog.views)),
                ],
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(blog.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Ob.option.copyWith(fontWeight: FontWeight.w700, height: 1.25, fontSize: 15),),
                      const SizedBox(height: 5),
                      Text(blog.excerpt,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Ob.note.copyWith(color: Ob.grey, height: 1.35, fontSize: 12.5),),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.schedule_rounded, size: 13, color: Ob.grey),
                          const SizedBox(width: 3),
                          Text('${blog.readMinutes} min',
                              style: Ob.note.copyWith(color: Ob.grey, fontWeight: FontWeight.w600, fontSize: 11.5),),
                          const Spacer(),
                          Text('Read more',
                              style: Ob.note.copyWith(color: Ob.purpleDeep, fontWeight: FontWeight.w800, fontSize: 12.5),),
                          const Icon(Icons.arrow_forward_rounded, size: 14, color: Ob.purpleDeep),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen reader for one blog, with a Share button at the bottom.
class BlogReaderScreen extends StatelessWidget {
  const BlogReaderScreen({super.key, required this.blog});
  final Blog blog;

  @override
  Widget build(BuildContext context) {
    final meta = <String>[
      if (blog.author != null && blog.author!.trim().isNotEmpty) blog.author!.trim(),
      '${blog.readMinutes} min read',
      if (blog.createdAt != null) DateFormat('d MMM yyyy').format(blog.createdAt!),
    ].join('  ·  ');

    return Scaffold(
      backgroundColor: Ob.bgColor,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: SizedBox(height: 236, width: double.infinity, child: _cover(blog.coverImage)),
              ),
              SliverToBoxAdapter(
                // Rounded content sheet pulled up over the image bottom — no
                // pinned bar, so nothing tucks under a coloured header on scroll.
                child: Transform.translate(
                  offset: const Offset(0, -20),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Ob.bgColor,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
                    ),
                    padding: EdgeInsets.fromLTRB(20, 24, 20, 32 + MediaQuery.of(context).padding.bottom),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(blog.title,
                            style: GoogleFonts.cormorantGaramond(fontSize: 29, fontWeight: FontWeight.w700, color: Ob.navy, height: 1.2),),
                        const SizedBox(height: 8),
                        Text(meta, style: Ob.note.copyWith(color: Ob.grey)),
                        const SizedBox(height: 18),
                        Text(blog.content, style: Ob.subtitle.copyWith(color: Ob.navy, height: 1.7, fontSize: 15.5)),
                        const SizedBox(height: 28),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(backgroundColor: Ob.goldDeep, padding: const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Share.share(
                              '${blog.title}\n\n${blog.excerpt.isEmpty ? '' : '${blog.excerpt}\n\n'}Read more on Asktro ✦',
                              subject: blog.title,
                            ),
                            icon: const Icon(Icons.ios_share_rounded, size: 18),
                            label: const Text('Share this article'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          // Floating back button — always visible, never a full-width bar.
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: Material(
              color: Colors.black.withValues(alpha: 0.38),
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => Navigator.of(context).maybePop(),
                child: const Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
