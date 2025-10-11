import { textureStore } from '../storage/index.js';

const DEBUG = true;
const log = (...args) => { if (DEBUG) console.log('[textures]', ...args); };

/**
 * Convert a canvas to a Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mime]
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, mime = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    try {
      if (mime === 'image/png') {
        // quality is ignored for PNG
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob returned null')), mime);
      } else {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob returned null')), mime, quality);
      }
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Compute a SHA-256 hex digest for a Blob.
 * Falls back to a random id if SubtleCrypto is unavailable.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function hashBlob(blob) {
  try {
    const ab = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', ab);
    const view = new DataView(digest);
    let hex = '';
    for (let i = 0; i < view.byteLength; i++) {
      const b = view.getUint8(i).toString(16).padStart(2, '0');
      hex += b;
    }
    return hex;
  } catch {
    // Fallback: random id
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * Save a canvas into localForage and return a TextureRef-like object.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mime]
 * @returns {Promise<{ id: string, mime: string, width: number, height: number }>}
 */
export async function saveCanvasAsTexture(canvas, mime = 'image/png') {
  // Build a deterministic id from content hash
  const blob = await canvasToBlob(canvas, mime);
  const hash = await hashBlob(blob);
  const id = `tex:sha256:${hash}`;
  // Use data URL to maximize compatibility (works with localStorage driver too)
  const dataURL = canvas.toDataURL(mime, mime === 'image/png' ? undefined : 0.92);
  try { await textureStore.ready(); } catch {}
  const driver = textureStore.driver ? textureStore.driver() : 'unknown-driver';
  log('saveCanvasAsTexture:', { id, mime, w: canvas.width, h: canvas.height, driver });
  const existing = await textureStore.getItem(id);
  if (!existing) {
    await textureStore.setItem(id, dataURL);
    log('stored new texture', id, 'size=', dataURL?.length || 0);
  } else {
    log('texture already stored, skipping write', id, 'type=', typeof existing);
  }
  return { id, mime, width: canvas.width, height: canvas.height };
}

/**
 * Compute a fixed per-vase slot id. 1-based index (0->1, ... 8->9).
 * Example: tex:vase-1
 * @param {number} vaseIndexZeroBased
 */
export function getFixedVaseSlotId(vaseIndexZeroBased) {
  const n = Number.isFinite(vaseIndexZeroBased) ? (vaseIndexZeroBased | 0) : 0;
  return `tex:vase-${n + 1}`;
}

/**
 * Save a canvas into a fixed per-vase slot (overwrites previous). Returns TextureRef-like.
 * This guarantees at most 9 textures when used exclusively.
 * @param {number} vaseIndexZeroBased
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mime]
 * @returns {Promise<{ id: string, mime: string, width: number, height: number }>}
 */
export async function saveCanvasToFixedVaseSlot(vaseIndexZeroBased, canvas, mime = 'image/png') {
  const id = getFixedVaseSlotId(vaseIndexZeroBased);
  const dataURL = canvas.toDataURL(mime, mime === 'image/png' ? undefined : 0.92);
  try { await textureStore.ready(); } catch {}
  const driver = textureStore.driver ? textureStore.driver() : 'unknown-driver';
  log('saveCanvasToFixedVaseSlot:', { id, mime, w: canvas.width, h: canvas.height, driver });
  await textureStore.setItem(id, dataURL);
  return { id, mime, width: canvas.width, height: canvas.height };
}

/**
 * Optional maintenance: remove any textures not in the allowed set of ids.
 * Use cautiously; ensure no Vase still references removed ids.
 * @param {Set<string>} allowed
 */
export async function cleanupTexturesExcept(allowed) {
  try { await textureStore.ready(); } catch {}
  const keys = await textureStore.keys();
  const toRemove = keys.filter((k) => !allowed.has(k));
  if (toRemove.length) log('cleanupTexturesExcept removing', toRemove.length, 'items');
  await Promise.allSettled(toRemove.map((k) => textureStore.removeItem(k)));
}

/**
 * Retrieve a Blob by texture id from localForage.
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getTextureBlob(id) {
  try {
    try { await textureStore.ready(); } catch {}
    const driver = textureStore.driver ? textureStore.driver() : 'unknown-driver';
    log('getTextureBlob:', id, 'driver=', driver);
    const val = await textureStore.getItem(id);
    if (!val) return null;
    if (val instanceof Blob) return val;
    if (typeof val === 'string') {
      // Support data URL stored as string
      if (val.startsWith('data:')) {
        try {
          const res = await fetch(val);
          const b = await res.blob();
          log('loaded dataURL->Blob', id, 'blobSize=', b.size);
          return b;
        } catch (e) {
          console.warn('[textures] Failed to convert dataURL to Blob', e);
          return null;
        }
      }
      // Unexpected string format; try to decode base64 if present
      if (val.startsWith('base64,')) {
        const dataUrl = 'data:application/octet-stream;' + val;
        const res = await fetch(dataUrl);
        const b = await res.blob();
        log('loaded base64->Blob', id, 'blobSize=', b.size);
        return b;
      }
      return null;
    }
    // Some drivers may have serialized to a plain object; try known shapes
    if (val && typeof val === 'object' && val.dataURL) {
      const res = await fetch(val.dataURL);
      const b = await res.blob();
      log('loaded object.dataURL->Blob', id, 'blobSize=', b.size);
      return b;
    }
    return null;
  } catch (e) {
    console.warn('[textures] getTextureBlob failed for', id, e);
    return null;
  }
}

/**
 * Given a TextureRef, load it into a 2D canvas of targetSize with cover fit.
 * @param {{ id: string, mime?: string }} ref
 * @param {number} targetSize
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function loadCanvasFromTextureRef(ref, targetSize = 1024) {
  if (!ref?.id) return null;
  log('loadCanvasFromTextureRef start', ref.id);
  const blob = await getTextureBlob(ref.id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    log('image loaded for', ref.id, 'natural=', img.naturalWidth, 'x', img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    // cover fit
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(targetSize / iw, targetSize / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (targetSize - dw) / 2;
    const dy = (targetSize - dh) / 2;
    ctx.clearRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, dx, dy, dw, dh);
    log('canvas drawn for', ref.id, 'size=', targetSize);
    return canvas;
  } catch (e) {
    console.warn('[textures] loadCanvasFromTextureRef failed', ref, e);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
