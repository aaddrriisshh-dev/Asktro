/// Ashtakoota (8-koota) definitions + helpers for the Kundali Match report.
///
/// ProKerala's kundli-matching returns each person's koota ATTRIBUTES under
/// `girl_info.koot` / `boy_info.koot` (varna, vasya, tara, yoni, graha_maitri,
/// gana, bhakoot, nadi) — it does NOT return per-koota points. So we present an
/// honest You-vs-Partner comparison of the real attributes plus each koota's
/// standard (fixed, factual) Vedic meaning and maximum guna weight — never any
/// fabricated per-user points. If a payload ever carries an explicit `koota`
/// list, it's used as-is.
library;

/// A koota's fixed definition: field key, display name, standard max gunas, and
/// what it measures (classical Ashtakoota meaning — universally true, not a
/// per-person prediction).
class KootaDef {
  const KootaDef(this.key, this.label, this.maxPoints, this.meaning);
  final String key;
  final String label;
  final int maxPoints;
  final String meaning;
}

const kootaDefs = <KootaDef>[
  KootaDef('varna', 'Varna', 1,
      'Spiritual compatibility and ego balance — how well the couple aligns in temperament and shared purpose.',),
  KootaDef('vasya', 'Vashya', 2,
      'Mutual attraction and influence — the natural magnetism and give-and-take of control between partners.',),
  KootaDef('tara', 'Tara', 3,
      'Birth-star compatibility — the couple’s destiny, health and overall well-being together.',),
  KootaDef('yoni', 'Yoni', 4,
      'Physical and intimate compatibility — sexual harmony and instinctive closeness.',),
  KootaDef('graha_maitri', 'Graha Maitri', 5,
      'Mental and intellectual bond — friendship, understanding and how the minds meet.',),
  KootaDef('gana', 'Gana', 6,
      'Temperament match — the couple’s inherent nature (Deva / Manushya / Rakshasa) and how it blends.',),
  KootaDef('bhakoot', 'Bhakoot', 7,
      'Emotional bond and prosperity — love, family welfare and the flow of fortune in the home.',),
  KootaDef('nadi', 'Nadi', 8,
      'Health and progeny — the most important koota, governing genes, vitality and children.',),
];

/// Returns rows shaped `{ name, girl, boy, max, meaning }` (or a passed-through
/// explicit `koota` list). Empty when the payload has neither.
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
    for (final k in kootaDefs)
      {
        'name': k.label,
        'girl': g[k.key]?.toString() ?? '—',
        'boy': b[k.key]?.toString() ?? '—',
        'max': k.maxPoints,
        'meaning': k.meaning,
      },
  ];
}

/// A human verdict + one-line summary for a guna-milan score out of `max`.
({String verdict, String summary}) matchVerdict(double total, double max) {
  final pct = max > 0 ? total / max : 0.0;
  if (pct >= 0.75) {
    return (
      verdict: 'Excellent match',
      summary:
          'A very strong Guna Milan score. The horoscopes are highly compatible across most kootas — an auspicious union by Vedic standards.',
    );
  }
  if (pct >= 0.5) {
    return (
      verdict: 'Good match',
      summary:
          'A favourable Guna Milan score. The couple shares solid compatibility, with a few kootas worth understanding before proceeding.',
    );
  }
  if (pct >= 0.3) {
    return (
      verdict: 'Average match',
      summary:
          'A moderate Guna Milan score. There is a workable foundation, but several kootas differ — guidance from an astrologer is advisable.',
    );
  }
  return (
    verdict: 'Needs consideration',
    summary:
        'A low Guna Milan score. Traditionally this pairing calls for careful thought and a consultation with an astrologer before marriage.',
  );
}
