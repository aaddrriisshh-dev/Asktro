import 'dart:typed_data';

import 'package:flutter_file_dialog/flutter_file_dialog.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'match_koota.dart';

/// Builds a printable, branded PDF of a Kundali Match (Ashtakoota Guna Milan)
/// report from the ProKerala matching payload, and either saves it to the
/// phone's Files or opens the share sheet. Defensive about the exact shape.
class MatchReportPdf {
  static const _navy = PdfColor.fromInt(0xFF322E63);
  static const _purple = PdfColor.fromInt(0xFF7E57C2);
  static const _gold = PdfColor.fromInt(0xFFB8942A);
  static const _green = PdfColor.fromInt(0xFF2F9C63);
  static const _muted = PdfColor.fromInt(0xFF7A7693);
  static const _lav = PdfColor.fromInt(0xFFF3EFFF);
  static const _line = PdfColor.fromInt(0xFFE2D8F4);

  /// Generate the report. When [share] is true it opens the share sheet and
  /// returns null; otherwise it saves to the phone's Files and returns the saved
  /// path (or null if the user cancelled the save).
  static Future<String?> generate({
    required Map<String, dynamic> data,
    required String selfName,
    required String partnerName,
    bool share = false,
  }) async {
    final bytes = await _build(data, selfName, partnerName);
    final fileName = _fileName(selfName, partnerName);
    if (share) {
      await Printing.sharePdf(bytes: bytes, filename: fileName);
      return null;
    }
    return FlutterFileDialog.saveFile(
      params: SaveFileDialogParams(
        data: bytes,
        fileName: fileName,
        mimeTypesFilter: const ['application/pdf'],
      ),
    );
  }

  static String _fileName(String selfName, String partnerName) {
    String clean(String s) => s.trim().replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
    final a = clean(selfName), b = clean(partnerName);
    final tag = [a, b].where((s) => s.isNotEmpty).join('-');
    return tag.isEmpty ? 'Asktro-Kundali-Match.pdf' : 'Asktro-Kundali-Match-$tag.pdf';
  }

  static Future<Uint8List> _build(Map<String, dynamic> data, String selfName, String partnerName) async {
    final gm = data['guna_milan'] is Map ? Map<String, dynamic>.from(data['guna_milan'] as Map) : null;
    final total = ((gm?['total_points'] ?? data['total_points']) as num?)?.toDouble() ?? 0;
    final max = ((gm?['maximum_points'] ?? data['maximum_points']) as num?)?.toDouble() ?? 36;
    final pct = max > 0 ? total / max : 0.0;
    final v = matchVerdict(total, max);
    final message = (data['message'] is Map ? data['message']['description'] : data['message'])?.toString().trim();
    final kootas = kootaRows(data);

    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.fromLTRB(36, 40, 36, 40),
        build: (ctx) => [
          _header(selfName, partnerName),
          pw.SizedBox(height: 18),
          _scoreBox(total, max, v.verdict, pct),
          pw.SizedBox(height: 18),
          _section('What this means'),
          pw.SizedBox(height: 6),
          pw.Text(v.summary, style: const pw.TextStyle(fontSize: 11, lineSpacing: 3, color: _navy)),
          if (message != null && message.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            _section('Astrologer’s note'),
            pw.SizedBox(height: 6),
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.all(12),
              decoration: pw.BoxDecoration(color: _lav, borderRadius: pw.BorderRadius.circular(8)),
              child: pw.Text(message, style: const pw.TextStyle(fontSize: 11, lineSpacing: 3, color: _navy)),
            ),
          ],
          if (kootas.isNotEmpty) ...[
            pw.SizedBox(height: 20),
            _section('Ashtakoota breakdown'),
            pw.SizedBox(height: 8),
            _kootaTable(kootas),
            pw.SizedBox(height: 16),
            _section('What each koota measures'),
            pw.SizedBox(height: 8),
            ..._kootaMeanings(kootas),
          ],
          pw.SizedBox(height: 26),
          _footer(),
        ],
      ),
    );
    return doc.save();
  }

  static pw.Widget _header(String selfName, String partnerName) {
    final a = selfName.trim().isEmpty ? 'You' : selfName.trim();
    final b = partnerName.trim().isEmpty ? 'Partner' : partnerName.trim();
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text('ASKTRO', style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: _gold, letterSpacing: 2)),
        pw.SizedBox(height: 4),
        pw.Text('Kundali Match Report', style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: _navy)),
        pw.SizedBox(height: 6),
        pw.Text('$a  &  $b', style: const pw.TextStyle(fontSize: 13, color: _purple)),
        pw.SizedBox(height: 2),
        pw.Text('Ashtakoota Guna Milan · generated ${DateFormat('d MMM yyyy').format(DateTime.now())}',
            style: const pw.TextStyle(fontSize: 9, color: _muted),),
        pw.SizedBox(height: 10),
        pw.Divider(color: _line, thickness: 1),
      ],
    );
  }

  static pw.Widget _scoreBox(double total, double max, String verdict, double pct) {
    final tStr = total == total.roundToDouble() ? total.toStringAsFixed(0) : total.toStringAsFixed(1);
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.all(18),
      decoration: pw.BoxDecoration(
        color: const PdfColor.fromInt(0xFFF6F2FF),
        borderRadius: pw.BorderRadius.circular(12),
        border: pw.Border.all(color: _line),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('GUNA MILAN', style: const pw.TextStyle(fontSize: 10, color: _muted, letterSpacing: 1)),
              pw.SizedBox(height: 4),
              pw.Text(verdict,
                  style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: pct >= 0.5 ? _green : _gold),),
            ],
          ),
          pw.Text('$tStr / ${max.toStringAsFixed(0)}',
              style: pw.TextStyle(fontSize: 30, fontWeight: pw.FontWeight.bold, color: _purple),),
        ],
      ),
    );
  }

  static pw.Widget _section(String title) => pw.Text(
        title,
        style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: _navy),
      );

  static pw.Widget _kootaTable(List<Map<String, dynamic>> kootas) {
    final rows = <List<String>>[
      ['Koota', 'Gunas', 'You', 'Partner'],
      for (final k in kootas)
        [
          '${k['name'] ?? '—'}',
          '${k['max'] ?? '—'}',
          '${k['girl'] ?? '—'}',
          '${k['boy'] ?? '—'}',
        ],
    ];
    return pw.TableHelper.fromTextArray(
      headerStyle: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
      headerDecoration: const pw.BoxDecoration(color: _navy),
      cellStyle: const pw.TextStyle(fontSize: 9.5, color: _navy),
      cellAlignments: {
        0: pw.Alignment.centerLeft,
        1: pw.Alignment.center,
        2: pw.Alignment.centerLeft,
        3: pw.Alignment.centerLeft,
      },
      columnWidths: {
        0: const pw.FlexColumnWidth(2.2),
        1: const pw.FlexColumnWidth(1.2),
        2: const pw.FlexColumnWidth(3),
        3: const pw.FlexColumnWidth(3),
      },
      border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFECE6FA)),
      rowDecoration: const pw.BoxDecoration(color: PdfColors.white),
      oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFFBF9FF)),
      data: rows,
    );
  }

  static List<pw.Widget> _kootaMeanings(List<Map<String, dynamic>> kootas) => [
        for (final k in kootas)
          if ((k['meaning'] as String?)?.isNotEmpty ?? false)
            pw.Padding(
              padding: const pw.EdgeInsets.only(bottom: 7),
              child: pw.RichText(
                text: pw.TextSpan(
                  children: [
                    pw.TextSpan(
                      text: '${k['name']}${k['max'] != null ? ' (${k['max']} gunas)' : ''}: ',
                      style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: _navy),
                    ),
                    pw.TextSpan(
                      text: '${k['meaning']}',
                      style: const pw.TextStyle(fontSize: 10, color: _muted, lineSpacing: 2),
                    ),
                  ],
                ),
              ),
            ),
      ];

  static pw.Widget _footer() {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Divider(color: _line, thickness: 1),
        pw.SizedBox(height: 6),
        pw.Text(
          'This report is generated for guidance based on Vedic astrology (Ashtakoota Guna Milan). '
          'It is not a substitute for a personal consultation with an astrologer.',
          style: const pw.TextStyle(fontSize: 8, color: _muted),
        ),
        pw.SizedBox(height: 4),
        pw.Text('© Asktro — guidance written in the stars', style: const pw.TextStyle(fontSize: 8, color: _gold)),
      ],
    );
  }
}
