'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/** Desktop image picker with a crop/reposition step. Choose a file → frame it to
 *  the exact shape it will appear in (drag + zoom, like Facebook) → it uploads
 *  the cropped image and returns the URL via onChange. Used everywhere in the
 *  store, so every photo is framed the same way and nothing gets clipped. */
export function ImageUpload({
  value, onChange, folder, label = 'Upload Photo', shape = 'square', aspect, original = false,
}: {
  value?: string;
  onChange: (url: string) => void;
  folder: string; // storage path prefix, e.g. 'store_images'
  label?: string;
  shape?: 'square' | 'wide' | 'portrait';
  /** width / height of the crop frame. Overrides `shape` when set. */
  aspect?: number;
  /** Upload the file exactly as chosen — no crop, no JPEG flatten — so a
   *  transparent PNG keeps its transparency (used for the Mall hero product). */
  original?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Crop modal state
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);

  const frameAspect = aspect ?? (shape === 'wide' ? 1.5 : shape === 'portrait' ? 0.8 : 1);

  function onFile(file: File) {
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return; }
    if (file.size > 12 * 1024 * 1024) { setErr('Image must be under 12 MB.'); return; }
    setErr(null);
    // Transparency-preserving path: upload the chosen file untouched.
    if (original) { void uploadOriginal(file); return; }
    const reader = new FileReader();
    reader.onload = () => { setSrc(reader.result as string); setCrop({ x: 0, y: 0 }); setZoom(1); };
    reader.readAsDataURL(file);
  }

  async function uploadOriginal(file: File) {
    setBusy(true);
    try {
      const ext = ((file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'png';
      const r = ref(storage, `${folder}/${Date.now()}.${ext}`);
      await uploadBytes(r, file, { contentType: file.type || 'image/png' });
      onChange(await getDownloadURL(r));
    } catch (e) { setErr('Upload failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const onCropComplete = useCallback((_a: Area, px: Area) => setAreaPx(px), []);

  async function useCrop() {
    if (!src || !areaPx) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(src, areaPx);
      const r = ref(storage, `${folder}/${Date.now()}.jpg`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      onChange(await getDownloadURL(r));
      setSrc(null);
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
        <span className="muted" style={{ fontSize: 11 }}>
          {original ? 'uploaded as-is · transparency kept · PNG / JPG / WebP' : 'you can crop & reposition · JPG, PNG, WebP'}
        </span>
        {err && <span style={{ color: 'var(--error)', fontSize: 11 }}>{err}</span>}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />

      {src && (
        <div className="crop-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setSrc(null); }}>
          <div className="crop-modal">
            <div className="crop-head">
              <strong>Crop &amp; reposition</strong>
              <span className="muted" style={{ fontSize: 12 }}>Drag to move · scroll / slider to zoom. What&apos;s in the frame is exactly what shows in the app.</span>
            </div>
            <div className="crop-stage">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={frameAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                restrictPosition
                objectFit="contain"
              />
            </div>
            <div className="crop-controls">
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Zoom</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
            </div>
            <div className="crop-actions">
              <button type="button" className="btn secondary" disabled={busy} onClick={() => setSrc(null)}>Cancel</button>
              <button type="button" className="btn" disabled={busy} onClick={useCrop}>{busy ? 'Uploading…' : 'Use this'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Draw the selected crop region to a canvas (capped to 1600px on the long side)
 *  and return a JPEG blob. */
async function cropToBlob(src: string, area: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const img = await loadImage(src);
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(area.width, area.height));
  const w = Math.max(1, Math.round(area.width * scale));
  const h = Math.max(1, Math.round(area.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  // Flatten onto white first — otherwise transparent PNG areas become black when
  // exported to JPEG (which has no alpha channel).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', 0.9);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}
