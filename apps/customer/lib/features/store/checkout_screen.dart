import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/providers.dart';
import 'store_home_screen.dart' show MallAppBar;
import 'store_models.dart';
import 'store_providers.dart';
import 'store_theme.dart';

const _kAddrKey = 'store_address_v1';

/// Checkout — delivery address + order summary, then Razorpay payment. On
/// success the order is verified server-side and the cart is cleared.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _pincode = TextEditingController();
  final _landmark = TextEditingController();

  late final Razorpay _razorpay;
  StoreOrderDraft? _draft;
  bool _processing = false;

  /// The saved-address doc currently loaded into the form (null = a new one).
  String? _selectedId;

  static const _shipFeePaise = 4900;
  static const _freeOverPaise = 49900;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay()
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess)
      ..on(Razorpay.EVENT_PAYMENT_ERROR, _onError)
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
    _prefill();
  }

  Future<void> _prefill() async {
    final profile = ref.read(myProfileProvider).valueOrNull;
    _name.text = profile?.name ?? '';
    _phone.text = profile?.phone ?? '';
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kAddrKey);
      if (raw != null) {
        final m = jsonDecode(raw) as Map<String, dynamic>;
        final a = ShippingAddress.fromMap(m);
        _name.text = a.name.isNotEmpty ? a.name : _name.text;
        _phone.text = a.phone.isNotEmpty ? a.phone : _phone.text;
        _line1.text = a.line1;
        _line2.text = a.line2;
        _city.text = a.city;
        _state.text = a.state;
        _pincode.text = a.pincode;
        _landmark.text = a.landmark;
      }
    } catch (_) {}
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _razorpay.clear();
    for (final c in [_name, _phone, _line1, _line2, _city, _state, _pincode, _landmark]) {
      c.dispose();
    }
    super.dispose();
  }

  void _loadAddress(SavedAddress a) {
    setState(() {
      _selectedId = a.id;
      _name.text = a.address.name;
      _phone.text = a.address.phone;
      _line1.text = a.address.line1;
      _line2.text = a.address.line2;
      _city.text = a.address.city;
      _state.text = a.address.state;
      _pincode.text = a.address.pincode;
      _landmark.text = a.address.landmark;
    });
  }

  void _newAddress() {
    setState(() {
      _selectedId = null;
      _line1.clear();
      _line2.clear();
      _city.clear();
      _state.clear();
      _pincode.clear();
      _landmark.clear();
    });
  }

  ShippingAddress _address() => ShippingAddress(
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        line1: _line1.text.trim(),
        line2: _line2.text.trim(),
        city: _city.text.trim(),
        state: _state.text.trim(),
        pincode: _pincode.text.trim(),
        landmark: _landmark.text.trim(),
      );

  Future<void> _placeOrder() async {
    if (!_form.currentState!.validate()) return;
    final items = ref.read(cartProvider);
    if (items.isEmpty) return;
    setState(() => _processing = true);
    final addr = _address();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kAddrKey, jsonEncode(addr.toMap()));
    } catch (_) {}
    // Save/refresh the address in the customer's address book.
    final uid = ref.read(currentUidProvider);
    if (uid != null) {
      try {
        _selectedId = await ref.read(storeRepositoryProvider).saveAddress(uid, addr, id: _selectedId);
      } catch (_) {}
    }
    try {
      final draft = await ref.read(storeServiceProvider).createOrder(items: items, address: addr);
      if (!mounted) return;
      _draft = draft;
      _razorpay.open({
        'key': draft.keyId,
        'order_id': draft.razorpayOrderId,
        'amount': draft.amountPaise,
        'currency': draft.currency,
        'name': 'Asktro Mall',
        'description': 'Order ${draft.orderNo}',
        'prefill': {'contact': addr.phone, 'name': addr.name},
        'theme': {'color': '#C8871A'},
      });
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() => _processing = false);
      _snack(e.message ?? 'Could not start checkout.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _processing = false);
      _snack('Something went wrong. Please try again.');
    }
  }

  Future<void> _onSuccess(PaymentSuccessResponse r) async {
    final draft = _draft;
    if (draft == null) return;
    try {
      await ref.read(storeServiceProvider).verifyOrder(
            razorpayOrderId: draft.razorpayOrderId,
            paymentId: r.paymentId ?? '',
            signature: r.signature ?? '',
          );
    } catch (_) {
      // Verification hiccup — the webhook backstop still confirms the paid
      // order, so send them to confirmation rather than showing a scary error.
    }
    if (!mounted) return;
    ref.read(cartProvider.notifier).clear();
    setState(() => _processing = false);
    context.pushReplacement('/store/order/${draft.storeOrderId}?placed=1');
  }

  void _onError(PaymentFailureResponse r) {
    if (!mounted) return;
    setState(() => _processing = false);
    _snack('Payment was not completed. You were not charged.');
  }

  void _snack(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m), behavior: SnackBarBehavior.floating));

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final subtotal = items.fold<int>(0, (n, c) => n + c.lineTotalPaise);
    final shipping = subtotal >= _freeOverPaise ? 0 : _shipFeePaise;
    final total = subtotal + shipping;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F5FF),
      appBar: const MallAppBar(title: 'Checkout', showCart: false),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
          children: [
            const _SectionTitle('Delivery address'),
            const SizedBox(height: 10),
            _addressBook(),
            Row(children: [
              Expanded(child: _field(_name, 'Full name', required: true)),
              const SizedBox(width: 10),
              Expanded(child: _field(_phone, 'Phone', keyboard: TextInputType.phone, required: true, phone: true)),
            ],),
            const SizedBox(height: 10),
            _field(_line1, 'House no., building, street', required: true),
            const SizedBox(height: 10),
            _field(_line2, 'Area, colony (optional)'),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _field(_city, 'City', required: true)),
              const SizedBox(width: 10),
              Expanded(child: _field(_state, 'State', required: true)),
            ],),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _field(_pincode, 'Pincode', keyboard: TextInputType.number, required: true, pincode: true)),
              const SizedBox(width: 10),
              Expanded(child: _field(_landmark, 'Landmark (optional)')),
            ],),
            const SizedBox(height: 22),
            const _SectionTitle('Order summary'),
            const SizedBox(height: 10),
            _summaryCard(items, subtotal, shipping, total),
            const SizedBox(height: 10),
            const Row(
              children: [
                Icon(Icons.lock_outline_rounded, size: 14, color: Mall.warmGrey),
                SizedBox(width: 6),
                Expanded(child: Text('Payments are secured by Razorpay. Physical goods are shipped to your address.',
                    style: TextStyle(fontSize: 11.5, color: Mall.warmGrey),),),
              ],
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: GestureDetector(
            onTap: _processing ? null : _placeOrder,
            child: Container(
              height: 54,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: _processing ? null : Mall.goldButton,
                color: _processing ? Mall.mrp : null,
                borderRadius: BorderRadius.circular(15),
              ),
              child: _processing
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4))
                  : Text('Pay ${Mall.rupees(total)}',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),),
            ),
          ),
        ),
      ),
    );
  }

  Widget _addressBook() {
    final saved = ref.watch(myStoreAddressesProvider).valueOrNull ?? const <SavedAddress>[];
    if (saved.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 96,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: saved.length + 1,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => i == saved.length ? _newAddressCard() : _savedAddressCard(saved[i]),
          ),
        ),
        const SizedBox(height: 6),
        const Text('Tap a saved address to fill the form, or add a new one.',
            style: TextStyle(fontSize: 11, color: Mall.warmGrey),),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _savedAddressCard(SavedAddress a) {
    final sel = _selectedId == a.id;
    return GestureDetector(
      onTap: () => _loadAddress(a),
      child: Container(
        width: 214,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: sel ? Mall.deep : const Color(0xFFE8E1F0), width: sel ? 1.6 : 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(sel ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 15, color: sel ? Mall.deep : Mall.mrp),
              const SizedBox(width: 6),
              Expanded(child: Text(a.address.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Mall.ink))),
            ],),
            const SizedBox(height: 5),
            Text('${a.address.line1}, ${a.address.city} ${a.address.pincode}',
                maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: Mall.warmGrey, height: 1.3),),
          ],
        ),
      ),
    );
  }

  Widget _newAddressCard() {
    final sel = _selectedId == null;
    return GestureDetector(
      onTap: _newAddress,
      child: Container(
        width: 120,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: sel ? Mall.cream : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: sel ? Mall.deep : const Color(0xFFE8E1F0), width: sel ? 1.6 : 1),
        ),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add_location_alt_outlined, color: Mall.goldInk),
            SizedBox(height: 4),
            Text('New address', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Mall.goldInk)),
          ],
        ),
      ),
    );
  }

  Widget _summaryCard(List<CartItem> items, int subtotal, int shipping, int total) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF0EAdb)),
      ),
      child: Column(
        children: [
          for (final c in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(child: Text('${c.qty} × ${c.product.title}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: Mall.ink))),
                  const SizedBox(width: 8),
                  Text(Mall.rupees(c.lineTotalPaise), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Mall.ink)),
                ],
              ),
            ),
          const Divider(height: 14),
          _line('Subtotal', Mall.rupees(subtotal)),
          const SizedBox(height: 5),
          _line('Shipping', shipping == 0 ? 'FREE' : Mall.rupees(shipping), green: shipping == 0),
          const Divider(height: 14),
          _line('Total', Mall.rupees(total), bold: true),
        ],
      ),
    );
  }

  Widget _line(String k, String v, {bool bold = false, bool green = false}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: bold ? Mall.navy : Mall.warmGrey, fontSize: bold ? 15 : 13)),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: green ? Mall.green : (bold ? Mall.navy : Mall.ink), fontSize: bold ? 16 : 13)),
        ],
      );

  Widget _field(TextEditingController c, String label,
      {TextInputType? keyboard, bool required = false, bool pincode = false, bool phone = false,}) {
    return TextFormField(
      controller: c,
      keyboardType: keyboard,
      style: const TextStyle(fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(fontSize: 13, color: Mall.warmGrey),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE8E1F0))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Mall.deep, width: 1.5)),
      ),
      validator: (v) {
        final t = (v ?? '').trim();
        if (required && t.isEmpty) return 'Required';
        if (pincode && t.isNotEmpty && !RegExp(r'^\d{6}$').hasMatch(t)) return 'Invalid pincode';
        if (phone && t.isNotEmpty && !RegExp(r'^\+?\d[\d\s-]{7,14}$').hasMatch(t)) return 'Invalid phone';
        return null;
      },
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontFamily: 'serif', fontSize: 18, fontWeight: FontWeight.w700, color: Mall.titleBrown),);
}
