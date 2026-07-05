'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/** Desktop image picker: choose a file, it uploads to Storage and returns the
 *  download URL via onChange. Shows a preview + progress. */
export function ImageUpload({
  value, onChange, folder, label = 'Upload Photo', shape = 'square',
}: {
  value?: string;
  onChange: (url: string) => void;
  folder: string; // storage path prefix, e.g. 'astrologer_photos'
  label?: string;
  shape?: 'square' | 'wide';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File) {
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setErr('Image must be under 8 MB.'); return; }
    setErr(null); setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const r = ref(storage, `${folder}/${Date.now()}_${safe}`);
      await uploadBytes(r, file, { contentType: file.type });
      onChange(await getDownloadURL(r));
    } catch (e) { setErr('Upload failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className={`imgup imgup--${shape}`}>
      <div className={`imgup-preview${value ? ' has' : ''}`} onClick={() => inputRef.current?.click()}>
        {value
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={value} alt="preview" />
          : <span className="imgup-plus">＋</span>}
      </div>
      <div className="imgup-side">
        <button type="button" className="btn sm secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : (value ? 'Change' : `⬆ ${label}`)}
        </button>
        <span className="muted" style={{ fontSize: 11 }}>or drag &amp; drop · JPG, PNG, WebP</span>
        {err && <span style={{ color: 'var(--error)', fontSize: 11 }}>{err}</span>}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
      />
    </div>
  );
}
