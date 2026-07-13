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
  });

  final String id;
  final String title;
  final String excerpt;
  final String content;
  final String coverImage;
  final String? author;
  final DateTime? createdAt;

  factory Blog.fromDoc(String id, Map<String, dynamic> m) => Blog(
        id: id,
        title: (m['title'] ?? '') as String,
        excerpt: (m['excerpt'] ?? '') as String,
        content: (m['content'] ?? '') as String,
        coverImage: (m['coverImage'] ?? '') as String,
        author: m['author'] as String?,
        createdAt: (m['createdAt'] as Timestamp?)?.toDate(),
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
                Text('From the Asktro Journal',
                    style: GoogleFonts.cormorantGaramond(fontSize: 22, fontWeight: FontWeight.w700, color: Ob.navy),),
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
          border: Border.all(color: Ob.border),
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
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(gradient: Ob.goldGradient, borderRadius: BorderRadius.circular(999)),
                    child: Text('${blog.readMinutes} min read',
                        style: Ob.note.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10),),
                  ),
                ),
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
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 236,
            pinned: true,
            backgroundColor: Ob.navy,
            foregroundColor: Colors.white,
            flexibleSpace: FlexibleSpaceBar(background: _cover(blog.coverImage)),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 32 + MediaQuery.of(context).padding.bottom),
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
        ],
      ),
    );
  }
}
