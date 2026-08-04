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
  value, onChange, folder, label = 'Upload Photo', shape = 'square', aspect, original = false, maxDim,
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
  /** Long-side pixel cap for this upload. Defaults to 1600 (general images);
   *  pass a smaller value (e.g. 512) for avatars so face photos stay tiny. */
  maxDim?: number;
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
      // No crop, but still optimize: cap dimensions + re-encode (WebP keeps the
      // transparency, so a heavy PNG becomes a light transparent WebP).
      const dataUrl = await fileToDataUrl(file);
      const out = await renderToBlob(dataUrl, { alpha: true, maxDim });
      const r = ref(storage, `${folder}/${Date.now()}.${out.ext}`);
      await uploadBytes(r, out.blob, { contentType: out.type });
      onChange(await getDownloadURL(r));
    } catch (e) { setErr('Upload failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const onCropComplete = useCallback((_a: Area, px: Area) => setAreaPx(px), []);

  async function useCrop() {
    if (!src || !areaPx) return;
    setBusy(true);
    try {
      const out = await renderToBlob(src, { alpha: false, area: areaPx, maxDim });
      const r = ref(storage, `${folder}/${Date.now()}.${out.ext}`);
      await uploadBytes(r, out.blob, { contentType: out.type });
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
          {original ? 'optimized for fast loading · transparency kept · PNG / JPG / WebP' : 'you can crop & reposition · JPG, PNG, WebP'}
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

/** Long-side pixel cap applied to every upload — plenty for any phone screen,
 *  and what keeps files small so the app never waits on a giant image. */
const MAX_DIM = 1600;

type Rect = { x: number; y: number; width: number; height: number };

/** Render an image (optionally a crop region) to a size-capped, compressed blob.
 *  When `alpha` is true the transparency is preserved (WebP); otherwise the image
 *  is flattened onto white. Encodes to WebP when the browser supports it (much
 *  smaller), falling back to PNG (alpha) or JPEG (opaque). */
async function renderToBlob(
  src: string,
  opts: { alpha: boolean; area?: Rect; maxDim?: number },
): Promise<{ blob: Blob; ext: string; type: string }> {
  const img = await loadImage(src);
  const sx = opts.area ? opts.area.x : 0;
  const sy = opts.area ? opts.area.y : 0;
  const sw = opts.area ? opts.area.width : img.naturalWidth || img.width;
  const sh = opts.area ? opts.area.height : img.naturalHeight || img.height;
  const cap = opts.maxDim && opts.maxDim > 0 ? opts.maxDim : MAX_DIM;
  const scale = Math.min(1, cap / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  if (!opts.alpha) {
    // JPEG/opaque path — flatten onto white so transparent areas don't go black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const toBlob = (type: string, q?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, q));

  // Prefer WebP (30–40% smaller); some older Safari builds silently emit PNG when
  // asked, so verify true WebP support before trusting it.
  const webpOk = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  if (webpOk) {
    const b = await toBlob('image/webp', opts.alpha ? 0.9 : 0.85);
    if (b && b.size > 0) return { blob: b, ext: 'webp', type: 'image/webp' };
  }
  if (opts.alpha) {
    const b = await toBlob('image/png');
    if (b) return { blob: b, ext: 'png', type: 'image/png' };
  }
  const b = await toBlob('image/jpeg', 0.9);
  if (b) return { blob: b, ext: 'jpg', type: 'image/jpeg' };
  throw new Error('Could not process image');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
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
