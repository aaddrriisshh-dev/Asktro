import 'package:cloud_firestore/cloud_firestore.dart';

/// A product category in the Asktro Mall (Rudraksha, Gemstones, …).
class StoreCategory {
  const StoreCategory({
    required this.id,
    required this.name,
    this.emoji = '',
    this.blurb = '',
    this.image = '',
    this.sortOrder = 0,
    this.parentId = '',
  });

  final String id;
  final String name;
  final String emoji;
  final String blurb;
  final String image;
  final int sortOrder;

  /// Empty for a top-level category; otherwise the id of the parent category.
  final String parentId;

  bool get isRoot => parentId.isEmpty;

  factory StoreCategory.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreCategory(
      id: d.id,
      name: (m['name'] ?? '') as String,
      emoji: (m['emoji'] ?? '') as String,
      blurb: (m['blurb'] ?? '') as String,
      image: (m['image'] ?? '') as String,
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
      parentId: (m['parentId'] ?? '') as String,
    );
  }
}

/// A hero banner shown in the storefront's top carousel (portal-managed:
/// `storeBanners`). Tapping optionally opens a linked category.
class StoreBanner {
  const StoreBanner({
    required this.id,
    this.image = '',
    this.headline = '',
    this.subtext = '',
    this.ctaLabel = '',
    this.linkCategoryId = '',
    this.sortOrder = 0,
  });

  final String id;
  final String image;
  final String headline;
  final String subtext;
  final String ctaLabel;
  final String linkCategoryId;
  final int sortOrder;

  factory StoreBanner.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreBanner(
      id: d.id,
      image: (m['image'] ?? '') as String,
      headline: (m['headline'] ?? '') as String,
      subtext: (m['subtext'] ?? '') as String,
      ctaLabel: (m['ctaLabel'] ?? '') as String,
      linkCategoryId: (m['linkCategoryId'] ?? '') as String,
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
    );
  }
}

/// A physical product for sale.
class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.title,
    required this.pricePaise,
    this.mrpPaise = 0,
    this.description = '',
    this.categoryId = '',
    this.categoryName = '',
    this.images = const [],
    this.stock,
    this.sortOrder = 0,
    this.rating = 4.8,
    this.ratingCount = 0,
    this.bestSeller = false,
    this.newLaunch = false,
    this.combo = false,
    this.specs = const [],
    this.bundleItems = const [],
    this.createdAtMs,
  });

  final String id;
  final String title;
  final int pricePaise;
  final int mrpPaise;
  final String description;
  final String categoryId;
  final String categoryName;
  final List<String> images;
  final int? stock;
  final int sortOrder;
  final double rating;
  final int ratingCount;
  final bool bestSeller;
  final bool newLaunch;
  final bool combo;
  final List<ProductSpec> specs;

  /// For a combo/bundle product: the individual products it contains.
  final List<BundleItem> bundleItems;
  final int? createdAtMs;

  String? get image => images.isNotEmpty ? images.first : null;
  bool get hasDiscount => mrpPaise > pricePaise;
  int get discountPercent =>
      hasDiscount ? (((mrpPaise - pricePaise) / mrpPaise) * 100).round() : 0;
  bool get inStock => stock == null || stock! > 0;

  factory StoreProduct.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreProduct(
      id: d.id,
      title: (m['title'] ?? '') as String,
      pricePaise: ((m['pricePaise'] ?? 0) as num).toInt(),
      mrpPaise: ((m['mrpPaise'] ?? 0) as num).toInt(),
      description: (m['description'] ?? '') as String,
      categoryId: (m['categoryId'] ?? '') as String,
      categoryName: (m['categoryName'] ?? '') as String,
      images: List<String>.from((m['images'] ?? const []) as List),
      stock: m['stock'] == null ? null : ((m['stock']) as num).toInt(),
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
      rating: ((m['rating'] ?? 4.8) as num).toDouble(),
      ratingCount: ((m['ratingCount'] ?? 0) as num).toInt(),
      bestSeller: (m['bestSeller'] ?? false) as bool,
      newLaunch: (m['newLaunch'] ?? false) as bool,
      combo: (m['combo'] ?? false) as bool,
      specs: ((m['specs'] ?? const []) as List)
          .map((e) => ProductSpec.fromMap(Map<String, dynamic>.from(e as Map)))
          .where((s) => s.label.isNotEmpty)
          .toList(),
      bundleItems: ((m['bundleItems'] ?? const []) as List)
          .map((e) => BundleItem.fromMap(Map<String, dynamic>.from(e as Map)))
          .where((b) => b.title.isNotEmpty)
          .toList(),
      createdAtMs: (m['createdAt'] as Timestamp?)?.millisecondsSinceEpoch,
    );
  }
}

/// One item inside a combo/bundle — a reference to another product (denormalised
/// title + image so the combo page needs no extra reads).
class BundleItem {
  const BundleItem({required this.productId, required this.title, this.image = '', this.qty = 1});
  final String productId;
  final String title;
  final String image;
  final int qty;

  factory BundleItem.fromMap(Map<String, dynamic> m) => BundleItem(
        productId: (m['productId'] ?? '') as String,
        title: (m['title'] ?? '') as String,
        image: (m['image'] ?? '') as String,
        qty: ((m['qty'] ?? 1) as num).toInt(),
      );
}

/// A single product specification row (e.g. Origin → Nepal).
class ProductSpec {
  const ProductSpec({required this.label, required this.value});
  final String label;
  final String value;

  factory ProductSpec.fromMap(Map<String, dynamic> m) =>
      ProductSpec(label: (m['k'] ?? '') as String, value: (m['v'] ?? '') as String);
}

/// A customer review on a product (`storeProducts/{id}/reviews/{rid}`). Seeded
/// / moderated from the portal for now; rolls up into the product rating.
class StoreReview {
  const StoreReview({
    required this.id,
    required this.name,
    required this.rating,
    this.title = '',
    this.body = '',
    this.verified = false,
    this.photo = '',
    this.createdAtMs,
  });

  final String id;
  final String name;
  final double rating;
  final String title;
  final String body;
  final bool verified;
  final String photo;
  final int? createdAtMs;

  factory StoreReview.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreReview(
      id: d.id,
      name: (m['name'] ?? 'Anonymous') as String,
      rating: ((m['rating'] ?? 5) as num).toDouble(),
      title: (m['title'] ?? '') as String,
      body: (m['body'] ?? '') as String,
      verified: (m['verified'] ?? false) as bool,
      photo: (m['photo'] ?? '') as String,
      createdAtMs: (m['createdAt'] as Timestamp?)?.millisecondsSinceEpoch,
    );
  }
}

/// A homepage social-proof card (portal-managed: `storeTestimonials`).
class StoreTestimonial {
  const StoreTestimonial({
    required this.id,
    required this.name,
    this.location = '',
    this.avatar = '',
    this.rating = 5,
    this.quote = '',
    this.sortOrder = 0,
  });

  final String id;
  final String name;
  final String location;
  final String avatar;
  final double rating;
  final String quote;
  final int sortOrder;

  factory StoreTestimonial.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreTestimonial(
      id: d.id,
      name: (m['name'] ?? '') as String,
      location: (m['location'] ?? '') as String,
      avatar: (m['avatar'] ?? '') as String,
      rating: ((m['rating'] ?? 5) as num).toDouble(),
      quote: (m['quote'] ?? '') as String,
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
    );
  }
}

/// A "why us" / how-to reel (portal-managed: `storeVideos`).
class StoreVideo {
  const StoreVideo({
    required this.id,
    required this.title,
    this.thumb = '',
    this.url = '',
    this.duration = '',
    this.sortOrder = 0,
  });

  final String id;
  final String title;
  final String thumb;
  final String url;
  final String duration;
  final int sortOrder;

  factory StoreVideo.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreVideo(
      id: d.id,
      title: (m['title'] ?? '') as String,
      thumb: (m['thumb'] ?? '') as String,
      url: (m['url'] ?? '') as String,
      duration: (m['duration'] ?? '') as String,
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
    );
  }
}

/// A store FAQ entry (portal-managed: `storeFaqs`).
class StoreFaq {
  const StoreFaq({
    required this.id,
    required this.question,
    required this.answer,
    this.sortOrder = 0,
  });

  final String id;
  final String question;
  final String answer;
  final int sortOrder;

  factory StoreFaq.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreFaq(
      id: d.id,
      question: (m['question'] ?? '') as String,
      answer: (m['answer'] ?? '') as String,
      sortOrder: ((m['sortOrder'] ?? 0) as num).toInt(),
    );
  }
}

/// A line in the cart (a product + a quantity). Prices are snapshotted for
/// display only — the server always recomputes the authoritative total.
class CartItem {
  const CartItem({required this.product, required this.qty});
  final StoreProduct product;
  final int qty;

  int get lineTotalPaise => product.pricePaise * qty;
  CartItem copyWith({int? qty}) => CartItem(product: product, qty: qty ?? this.qty);
}

/// A delivery address entered at checkout.
class ShippingAddress {
  const ShippingAddress({
    required this.name,
    required this.phone,
    required this.line1,
    this.line2 = '',
    required this.city,
    required this.state,
    required this.pincode,
    this.landmark = '',
  });

  final String name;
  final String phone;
  final String line1;
  final String line2;
  final String city;
  final String state;
  final String pincode;
  final String landmark;

  Map<String, dynamic> toMap() => {
        'name': name, 'phone': phone, 'line1': line1, 'line2': line2,
        'city': city, 'state': state, 'pincode': pincode, 'landmark': landmark,
      };

  factory ShippingAddress.fromMap(Map<String, dynamic> m) => ShippingAddress(
        name: (m['name'] ?? '') as String,
        phone: (m['phone'] ?? '') as String,
        line1: (m['line1'] ?? '') as String,
        line2: (m['line2'] ?? '') as String,
        city: (m['city'] ?? '') as String,
        state: (m['state'] ?? '') as String,
        pincode: (m['pincode'] ?? '') as String,
        landmark: (m['landmark'] ?? '') as String,
      );
}

/// A saved delivery address in the customer's address book.
class SavedAddress {
  const SavedAddress({required this.id, required this.address, this.lastUsedMs});
  final String id;
  final ShippingAddress address;
  final int? lastUsedMs;

  factory SavedAddress.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return SavedAddress(
      id: d.id,
      address: ShippingAddress.fromMap(m),
      lastUsedMs: (m['lastUsedAt'] as Timestamp?)?.millisecondsSinceEpoch,
    );
  }
}

/// A placed order, as read back for the customer's "My Orders".
class StoreOrder {
  const StoreOrder({
    required this.id,
    required this.orderNo,
    required this.status,
    required this.totalPaise,
    required this.subtotalPaise,
    required this.shippingPaise,
    required this.itemCount,
    required this.items,
    required this.address,
    this.trackingNumber,
    this.courier,
    this.createdAtMs,
  });

  final String id;
  final String orderNo;
  final String status;
  final int totalPaise;
  final int subtotalPaise;
  final int shippingPaise;
  final int itemCount;
  final List<OrderLine> items;
  final ShippingAddress? address;
  final String? trackingNumber;
  final String? courier;
  final int? createdAtMs;

  factory StoreOrder.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreOrder(
      id: d.id,
      orderNo: (m['orderNo'] ?? d.id) as String,
      status: (m['status'] ?? 'pending_payment') as String,
      totalPaise: ((m['totalPaise'] ?? 0) as num).toInt(),
      subtotalPaise: ((m['subtotalPaise'] ?? 0) as num).toInt(),
      shippingPaise: ((m['shippingPaise'] ?? 0) as num).toInt(),
      itemCount: ((m['itemCount'] ?? 0) as num).toInt(),
      items: ((m['items'] ?? const []) as List)
          .map((e) => OrderLine.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList(),
      address: m['address'] == null
          ? null
          : ShippingAddress.fromMap(Map<String, dynamic>.from(m['address'] as Map)),
      trackingNumber: m['trackingNumber'] as String?,
      courier: m['courier'] as String?,
      createdAtMs: (m['createdAt'] as Timestamp?)?.millisecondsSinceEpoch,
    );
  }
}

class OrderLine {
  const OrderLine({
    required this.title,
    required this.qty,
    required this.pricePaise,
    required this.lineTotalPaise,
    this.image,
  });
  final String title;
  final int qty;
  final int pricePaise;
  final int lineTotalPaise;
  final String? image;

  factory OrderLine.fromMap(Map<String, dynamic> m) => OrderLine(
        title: (m['title'] ?? '') as String,
        qty: ((m['qty'] ?? 1) as num).toInt(),
        pricePaise: ((m['pricePaise'] ?? 0) as num).toInt(),
        lineTotalPaise: ((m['lineTotalPaise'] ?? 0) as num).toInt(),
        image: m['image'] as String?,
      );
}
