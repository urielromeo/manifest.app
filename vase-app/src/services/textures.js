import { textureStore } from '../storage/index.js';

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
  const blob = await canvasToBlob(canvas, mime);
  const hash = await hashBlob(blob);
  const id = `tex:sha256:${hash}`;
  // Deduplicate: only write if not present
  const existing = await textureStore.getItem(id);
  if (!existing) {
    await textureStore.setItem(id, blob);
  }
  return { id, mime, width: canvas.width, height: canvas.height };
}

/**
 * Retrieve a Blob by texture id from localForage.
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getTextureBlob(id) {
  try {
    const blob = await textureStore.getItem(id);
    return blob || null;
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
    return canvas;
  } catch (e) {
    console.warn('[textures] loadCanvasFromTextureRef failed', ref, e);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
