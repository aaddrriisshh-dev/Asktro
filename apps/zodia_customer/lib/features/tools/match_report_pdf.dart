import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_file_dialog/flutter_file_dialog.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'match_koota.dart';

/// Builds a branded, celestial-styled PDF of a Kundali Match (Ashtakoota Guna
/// Milan) report from the ProKerala matching payload, and either saves it to the
/// phone's Files or opens the share sheet. Defensive about the exact shape.
class MatchReportPdf {
  static const _navy = PdfColor.fromInt(0xFF17120A);
  static const _purpleDeep = PdfColor.fromInt(0xFF20190F);
  static const _purple = PdfColor.fromInt(0xFF2B2417);
  static const _gold = PdfColor.fromInt(0xFFF5B301);
  static const _goldDeep = PdfColor.fromInt(0xFFC08A12);
  static const _green = PdfColor.fromInt(0xFF2F9C63);
  static const _muted = PdfColor.fromInt(0xFF7A7693);
  static const _lav = PdfColor.fromInt(0xFFF3EFFF);
  static const _line = PdfColor.fromInt(0xFFE2D8F4);
  static const _bgTop = PdfColor.fromInt(0xFFF6F2FF);
  static const _white = PdfColors.white;

  static const _downloads = MethodChannel('asktro/downloads');

  /// Generate the report. When [share] is true it opens the share sheet and
  /// returns null. Otherwise it downloads straight to the phone's Downloads
  /// (silent, with a "Download complete" notification) and returns a short label
  /// like "Downloads". On older Android / iOS / any failure it falls back to the
  /// system save dialog.
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
    if (Platform.isAndroid) {
      try {
        final saved = await _downloads.invokeMethod<String>('saveToDownloads', {
          'bytes': bytes,
          'fileName': fileName,
          'mime': 'application/pdf',
        });
        if (saved != null) return 'Downloads';
      } catch (_) {
        // Fall through to the system save dialog.
      }
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
    return tag.isEmpty ? 'Zodia-Kundali-Match.pdf' : 'Zodia-Kundali-Match-$tag.pdf';
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
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.fromLTRB(32, 30, 32, 34),
          // Soft celestial wash behind everything (kept light for readability).
          buildBackground: (ctx) => pw.FullPage(
            ignoreMargins: true,
            child: pw.Container(
              decoration: const pw.BoxDecoration(
                gradient: pw.LinearGradient(
                  begin: pw.Alignment.topCenter,
                  end: pw.Alignment.bottomCenter,
                  colors: [_bgTop, _white],
                ),
              ),
            ),
          ),
        ),
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
              decoration: pw.BoxDecoration(
                color: _lav,
                borderRadius: pw.BorderRadius.circular(10),
                border: pw.Border.all(color: _line),
              ),
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

  /// A deep navy→purple celestial header band with the gold ZODIA wordmark.
  static pw.Widget _header(String selfName, String partnerName) {
    final a = selfName.trim().isEmpty ? 'You' : selfName.trim();
    final b = partnerName.trim().isEmpty ? 'Partner' : partnerName.trim();
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.fromLTRB(22, 20, 22, 20),
      decoration: pw.BoxDecoration(
        gradient: const pw.LinearGradient(
          begin: pw.Alignment.topLeft,
          end: pw.Alignment.bottomRight,
          colors: [_navy, _purpleDeep, _purple],
        ),
        borderRadius: pw.BorderRadius.circular(18),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('✦  ZODIA',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: _gold, letterSpacing: 3),),
          pw.SizedBox(height: 8),
          pw.Text('Kundali Match Report',
              style: pw.TextStyle(fontSize: 25, fontWeight: pw.FontWeight.bold, color: _white),),
          pw.SizedBox(height: 6),
          pw.Text('$a  &  $b', style: const pw.TextStyle(fontSize: 13, color: PdfColor.fromInt(0xFFE6DBFF))),
          pw.SizedBox(height: 2),
          pw.Text('Ashtakoota Guna Milan · generated ${DateFormat('d MMM yyyy').format(DateTime.now())}',
              style: const pw.TextStyle(fontSize: 9, color: PdfColor.fromInt(0xFFB9AEE0)),),
        ],
      ),
    );
  }

  /// A verdict card with the score inside a gold ring.
  static pw.Widget _scoreBox(double total, double max, String verdict, double pct) {
    final tStr = total == total.roundToDouble() ? total.toStringAsFixed(0) : total.toStringAsFixed(1);
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.all(18),
      decoration: pw.BoxDecoration(
        color: _white,
        borderRadius: pw.BorderRadius.circular(14),
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
              pw.SizedBox(height: 5),
              pw.Text(verdict,
                  style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: pct >= 0.5 ? _green : _goldDeep),),
            ],
          ),
          pw.Container(
            width: 84,
            height: 84,
            alignment: pw.Alignment.center,
            decoration: pw.BoxDecoration(
              shape: pw.BoxShape.circle,
              color: _bgTop,
              border: pw.Border.all(color: _gold, width: 2.5),
            ),
            child: pw.Column(
              mainAxisAlignment: pw.MainAxisAlignment.center,
              children: [
                pw.Text(tStr, style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold, color: _purpleDeep)),
                pw.Text('of ${max.toStringAsFixed(0)}', style: const pw.TextStyle(fontSize: 9, color: _muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static pw.Widget _section(String title) => pw.Row(
        children: [
          pw.Container(width: 4, height: 14, decoration: pw.BoxDecoration(color: _gold, borderRadius: pw.BorderRadius.circular(2))),
          pw.SizedBox(width: 8),
          pw.Text(title, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: _navy)),
        ],
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
      headerStyle: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: _white),
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
      border: pw.TableBorder.all(color: _line),
      rowDecoration: const pw.BoxDecoration(color: _white),
      oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFFFFFFF)),
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
        pw.Text('© Zodia — guidance written in the stars', style: const pw.TextStyle(fontSize: 8, color: _goldDeep)),
      ],
    );
  }
}
