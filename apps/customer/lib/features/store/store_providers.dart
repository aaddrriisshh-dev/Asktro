import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import 'store_models.dart';

/// Reads the Asktro Mall catalog + the signed-in user's orders.
class StoreRepository {
  StoreRepository(this._db);
  final FirebaseFirestore _db;

  Stream<List<StoreCategory>> watchCategories() {
    return _db
        .collection('storeCategories')
        .where('active', isEqualTo: true)
        .orderBy('sortOrder')
        .snapshots()
        .map((s) => s.docs.map(StoreCategory.fromDoc).toList());
  }

  Stream<List<StoreProduct>> watchProductsByCategory(String categoryId) {
    return _db
        .collection('storeProducts')
        .where('categoryId', isEqualTo: categoryId)
        .where('active', isEqualTo: true)
        .orderBy('sortOrder')
        .snapshots()
        .map((s) => s.docs.map(StoreProduct.fromDoc).toList());
  }

  /// A small "featured" strip for the store home — newest active products.
  Stream<List<StoreProduct>> watchFeatured({int limit = 8}) {
    return _db
        .collection('storeProducts')
        .where('active', isEqualTo: true)
        .orderBy('sortOrder')
        .limit(limit)
        .snapshots()
        .map((s) => s.docs.map(StoreProduct.fromDoc).toList());
  }

  /// All active products (bounded) — the store home derives Best Sellers, New
  /// Launches and the All-Products grid from this single stream. Uses only a
  /// single-field equality filter (auto-indexed) and sorts by sortOrder on the
  /// client, so it never depends on a composite index being built.
  Stream<List<StoreProduct>> watchActiveProducts({int limit = 60}) {
    return _db
        .collection('storeProducts')
        .where('active', isEqualTo: true)
        .limit(limit)
        .snapshots()
        .map((s) {
      final list = s.docs.map(StoreProduct.fromDoc).toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      return list;
    });
  }

  /// Storefront hero banners (active), sorted client-side.
  Stream<List<StoreBanner>> watchBanners() {
    return _db
        .collection('storeBanners')
        .where('active', isEqualTo: true)
        .limit(15)
        .snapshots()
        .map((s) => s.docs.map(StoreBanner.fromDoc).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),);
  }

  /// Portal-managed shipping rates (config/store) — used to show the checkout
  /// estimate that matches the server's authoritative charge.
  Stream<StoreShipping> watchShipping() {
    return _db.collection('config').doc('store').snapshots().map(
          (d) => StoreShipping.fromMap(d.data() ?? const {}),
        );
  }

  /// Editable claim-strip phrases (homeSections/storeClaims); empty = use default.
  Stream<List<String>> watchClaims() {
    return _db.collection('homeSections').doc('storeClaims').snapshots().map((d) {
      final m = d.data() ?? {};
      if ((m['active'] ?? true) == false) return const <String>[];
      return List<String>.from((m['phrases'] ?? const []) as List)
          .where((p) => p.trim().isNotEmpty)
          .toList();
    });
  }

  /// Homepage testimonials (active), sorted client-side.
  Stream<List<StoreTestimonial>> watchTestimonials() {
    return _db
        .collection('storeTestimonials')
        .where('active', isEqualTo: true)
        .limit(30)
        .snapshots()
        .map((s) => s.docs.map(StoreTestimonial.fromDoc).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),);
  }

  /// "Why us" / how-to videos (active), sorted client-side.
  Stream<List<StoreVideo>> watchVideos() {
    return _db
        .collection('storeVideos')
        .where('active', isEqualTo: true)
        .limit(30)
        .snapshots()
        .map((s) => s.docs.map(StoreVideo.fromDoc).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),);
  }

  /// Store FAQs (active), sorted client-side.
  Stream<List<StoreFaq>> watchFaqs() {
    return _db
        .collection('storeFaqs')
        .where('active', isEqualTo: true)
        .limit(40)
        .snapshots()
        .map((s) => s.docs.map(StoreFaq.fromDoc).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),);
  }

  /// Approved reviews for a product, newest first (client-sorted).
  Stream<List<StoreReview>> watchReviews(String productId) {
    return _db
        .collection('storeProducts')
        .doc(productId)
        .collection('reviews')
        .where('status', isEqualTo: 'approved')
        .limit(50)
        .snapshots()
        .map((s) => s.docs.map(StoreReview.fromDoc).toList()
          ..sort((a, b) => (b.createdAtMs ?? 0).compareTo(a.createdAtMs ?? 0)),);
  }

  Future<StoreProduct?> fetchProduct(String id) async {
    final d = await _db.collection('storeProducts').doc(id).get();
    return d.exists ? StoreProduct.fromDoc(d) : null;
  }

  Stream<List<StoreOrder>> watchMyOrders(String uid) {
    return _db
        .collection('storeOrders')
        .where('userId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((s) => s.docs.map(StoreOrder.fromDoc).toList());
  }

  Stream<StoreOrder?> watchOrder(String id) {
    return _db.collection('storeOrders').doc(id).snapshots().map(
          (d) => d.exists ? StoreOrder.fromDoc(d) : null,
        );
  }

  // ---- Address book ----
  CollectionReference<Map<String, dynamic>> _addrCol(String uid) =>
      _db.collection('users').doc(uid).collection('shippingAddresses');

  Stream<List<SavedAddress>> watchAddresses(String uid) {
    return _addrCol(uid).limit(25).snapshots().map(
          (s) => s.docs.map(SavedAddress.fromDoc).toList()
            ..sort((a, b) => (b.lastUsedMs ?? 0).compareTo(a.lastUsedMs ?? 0)),
        );
  }

  /// Upsert an address (new when [id] is null) and stamp it as most-recently used.
  Future<String> saveAddress(String uid, ShippingAddress a, {String? id}) async {
    final data = {...a.toMap(), 'lastUsedAt': FieldValue.serverTimestamp()};
    if (id != null) {
      await _addrCol(uid).doc(id).set(data, SetOptions(merge: true));
      return id;
    }
    final ref = await _addrCol(uid).add({...data, 'createdAt': FieldValue.serverTimestamp()});
    return ref.id;
  }

  Future<void> deleteAddress(String uid, String id) => _addrCol(uid).doc(id).delete();

  /// Fetch a coupon by code for a checkout preview (server re-validates).
  Future<StoreCoupon?> fetchCoupon(String code) async {
    final d = await _db.collection('storeCoupons').doc(code.trim().toUpperCase()).get();
    return d.exists ? StoreCoupon.fromDoc(d) : null;
  }
}

/// Result of createStoreOrder — everything Razorpay checkout needs.
class StoreOrderDraft {
  const StoreOrderDraft({
    required this.storeOrderId,
    required this.orderNo,
    required this.razorpayOrderId,
    required this.amountPaise,
    required this.currency,
    required this.keyId,
  });
  final String storeOrderId;
  final String orderNo;
  final String razorpayOrderId;
  final int amountPaise;
  final String currency;
  final String keyId;
}

/// Calls the store checkout Cloud Functions.
class StoreService {
  StoreService(this._fn);
  final FirebaseFunctions _fn;

  Future<StoreOrderDraft> createOrder({
    required List<CartItem> items,
    required ShippingAddress address,
    String? couponCode,
  }) async {
    final res = await _fn.httpsCallable('createStoreOrder').call<Map<String, dynamic>>({
      'items': items.map((c) => {'productId': c.product.id, 'qty': c.qty}).toList(),
      'address': address.toMap(),
      if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
    });
    final m = Map<String, dynamic>.from(res.data);
    return StoreOrderDraft(
      storeOrderId: m['storeOrderId'] as String,
      orderNo: (m['orderNo'] ?? '') as String,
      razorpayOrderId: m['orderId'] as String,
      amountPaise: ((m['amount'] ?? m['totalPaise'] ?? 0) as num).toInt(),
      currency: (m['currency'] ?? 'INR') as String,
      keyId: m['keyId'] as String,
    );
  }

  Future<void> verifyOrder({
    required String razorpayOrderId,
    required String paymentId,
    required String signature,
  }) async {
    await _fn.httpsCallable('verifyStoreOrder').call<Map<String, dynamic>>({
      'orderId': razorpayOrderId,
      'paymentId': paymentId,
      'signature': signature,
    });
  }
}

// ---- Cart (local, in-memory per session) ----
class CartNotifier extends StateNotifier<List<CartItem>> {
  CartNotifier() : super(const []);

  void add(StoreProduct p, {int qty = 1}) {
    final i = state.indexWhere((c) => c.product.id == p.id);
    if (i == -1) {
      state = [...state, CartItem(product: p, qty: qty)];
    } else {
      final cur = state[i];
      final next = [...state];
      next[i] = cur.copyWith(qty: cur.qty + qty);
      state = next;
    }
  }

  void setQty(String productId, int qty) {
    if (qty <= 0) {
      remove(productId);
      return;
    }
    state = [
      for (final c in state)
        if (c.product.id == productId) c.copyWith(qty: qty) else c,
    ];
  }

  void remove(String productId) =>
      state = state.where((c) => c.product.id != productId).toList();

  void clear() => state = const [];

  int get count => state.fold(0, (n, c) => n + c.qty);
  int get subtotalPaise => state.fold(0, (n, c) => n + c.lineTotalPaise);
}

final storeRepositoryProvider =
    Provider<StoreRepository>((ref) => StoreRepository(ref.watch(firestoreProvider)));

final storeServiceProvider =
    Provider<StoreService>((ref) => StoreService(ref.watch(functionsProvider)));

final cartProvider =
    StateNotifierProvider<CartNotifier, List<CartItem>>((ref) => CartNotifier());

/// Total distinct-quantity count for the cart badge.
final cartCountProvider = Provider<int>((ref) {
  final items = ref.watch(cartProvider);
  return items.fold(0, (n, c) => n + c.qty);
});

final storeCategoriesProvider = StreamProvider<List<StoreCategory>>(
  (ref) => ref.watch(storeRepositoryProvider).watchCategories(),
);

final storeFeaturedProvider = StreamProvider<List<StoreProduct>>(
  (ref) => ref.watch(storeRepositoryProvider).watchFeatured(),
);

/// Top-level categories only (parentId empty) — derived from the full stream.
final storeRootCategoriesProvider = Provider<List<StoreCategory>>((ref) {
  final all = ref.watch(storeCategoriesProvider).valueOrNull ?? const [];
  return all.where((c) => c.isRoot).toList();
});

/// Direct children of a category — derived from the full stream (no new query).
final storeSubcategoriesProvider = Provider.family<List<StoreCategory>, String>((ref, parentId) {
  final all = ref.watch(storeCategoriesProvider).valueOrNull ?? const [];
  return all.where((c) => c.parentId == parentId).toList();
});

final storeAllProductsProvider = StreamProvider<List<StoreProduct>>(
  (ref) => ref.watch(storeRepositoryProvider).watchActiveProducts(),
);

final storeBannersProvider = StreamProvider<List<StoreBanner>>(
  (ref) => ref.watch(storeRepositoryProvider).watchBanners(),
);

final storeClaimsProvider = StreamProvider<List<String>>(
  (ref) => ref.watch(storeRepositoryProvider).watchClaims(),
);

/// Live shipping rates from the portal (config/store), with a sensible default
/// while it loads so the checkout never blocks on it.
final storeShippingProvider = StreamProvider<StoreShipping>(
  (ref) => ref.watch(storeRepositoryProvider).watchShipping(),
);

final storeReviewsProvider = StreamProvider.family<List<StoreReview>, String>(
  (ref, productId) => ref.watch(storeRepositoryProvider).watchReviews(productId),
);

final storeTestimonialsProvider = StreamProvider<List<StoreTestimonial>>(
  (ref) => ref.watch(storeRepositoryProvider).watchTestimonials(),
);

final storeVideosProvider = StreamProvider<List<StoreVideo>>(
  (ref) => ref.watch(storeRepositoryProvider).watchVideos(),
);

final storeFaqsProvider = StreamProvider<List<StoreFaq>>(
  (ref) => ref.watch(storeRepositoryProvider).watchFaqs(),
);

final storeProductsByCategoryProvider =
    StreamProvider.family<List<StoreProduct>, String>(
  (ref, categoryId) =>
      ref.watch(storeRepositoryProvider).watchProductsByCategory(categoryId),
);

final myOrdersProvider = StreamProvider<List<StoreOrder>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(storeRepositoryProvider).watchMyOrders(uid);
});

final storeOrderProvider = StreamProvider.family<StoreOrder?, String>(
  (ref, id) => ref.watch(storeRepositoryProvider).watchOrder(id),
);

final myStoreAddressesProvider = StreamProvider<List<SavedAddress>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(storeRepositoryProvider).watchAddresses(uid);
});
