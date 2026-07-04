// Client-side CSV + Excel export. Give it rows + a column spec and it downloads.

export interface Col<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function esc(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV<T>(rows: T[], cols: Col<T>[]): string {
  const head = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(c.value(r))).join(',')).join('\n');
  return head + '\n' + body;
}

function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV<T>(filename: string, rows: T[], cols: Col<T>[]): void {
  // BOM so Excel opens UTF-8 (₹, names) correctly.
  saveBlob(filename, new Blob(['﻿' + toCSV(rows, cols)], { type: 'text/csv;charset=utf-8;' }));
}

const escHtml = (v: string | number | null | undefined) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Real Excel file via SpreadsheetML-compatible HTML (opens natively in Excel). */
export function downloadXLS<T>(filename: string, rows: T[], cols: Col<T>[]): void {
  const head = `<tr>${cols.map((c) => `<th>${escHtml(c.label)}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${escHtml(c.value(r))}</td>`).join('')}</tr>`).join('');
  const html =
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head>` +
    `<body><table border="1">${head}${body}</table></body></html>`;
  saveBlob(filename, new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }));
}

/** Firestore Timestamp → readable local datetime for a cell. */
export const tsCell = (t: { toMillis?: () => number } | undefined | null): string =>
  t?.toMillis ? new Date(t.toMillis()).toLocaleString('en-IN') : '';

/** paise → rupees number for a cell. */
export const rupeeCell = (paise: unknown): number => (typeof paise === 'number' ? Math.round(paise) / 100 : 0);
