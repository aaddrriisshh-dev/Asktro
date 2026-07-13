/// Builds the 8-koota (Ashtakoota) breakdown rows from ProKerala's
/// kundli-matching payload.
///
/// ProKerala's kundli-matching returns each person's koota ATTRIBUTES under
/// `girl_info.koot` / `boy_info.koot` (varna, vasya, tara, yoni, graha_maitri,
/// gana, bhakoot, nadi) — it does NOT return per-koota points. So we present an
/// honest You-vs-Partner comparison of the real attributes and never fabricate
/// points. If a payload ever carries an explicit `koota` list, it's used as-is.
library;

const _kootaDefs = <({String key, String label})>[
  (key: 'varna', label: 'Varna'),
  (key: 'vasya', label: 'Vashya'),
  (key: 'tara', label: 'Tara'),
  (key: 'yoni', label: 'Yoni'),
  (key: 'graha_maitri', label: 'Graha Maitri'),
  (key: 'gana', label: 'Gana'),
  (key: 'bhakoot', label: 'Bhakoot'),
  (key: 'nadi', label: 'Nadi'),
];

/// Returns rows shaped `{ name, girl, boy }` (or a passed-through explicit
/// `koota` list). Empty when the payload has neither.
List<Map<String, dynamic>> kootaRows(Map<String, dynamic> data) {
  if (data['koota'] is List) {
    return List<Map<String, dynamic>>.from(
      (data['koota'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)),
    );
  }
  Map<String, dynamic>? koot(Object? info) =>
      info is Map && info['koot'] is Map ? Map<String, dynamic>.from(info['koot'] as Map) : null;
  final g = koot(data['girl_info']);
  final b = koot(data['boy_info']);
  if (g == null || b == null) return const [];
  return [
    for (final k in _kootaDefs)
      {'name': k.label, 'girl': g[k.key]?.toString() ?? '—', 'boy': b[k.key]?.toString() ?? '—'},
  ];
}
