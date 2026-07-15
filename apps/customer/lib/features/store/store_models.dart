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
  });

  final String id;
  final String name;
  final String emoji;
  final String blurb;
  final String image;
  final int sortOrder;

  factory StoreCategory.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final m = d.data() ?? {};
    return StoreCategory(
      id: d.id,
      name: (m['name'] ?? '') as String,
      emoji: (m['emoji'] ?? '') as String,
      blurb: (m['blurb'] ?? '') as String,
      image: (m['image'] ?? '') as String,
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
      createdAtMs: (m['createdAt'] as Timestamp?)?.millisecondsSinceEpoch,
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
