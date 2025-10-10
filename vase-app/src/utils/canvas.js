// Utility functions to create canvases with solid colors or text overlays

/**
 * Create a square canvas filled with a solid color.
 * @param {string} hex - Hex color code (e.g. '#ff0000').
 * @param {number} [size=1024] - Width and height of the canvas in pixels.
 * @returns {HTMLCanvasElement|null} - The created canvas, or null if document is undefined.
 */

export function createSolidColorCanvas(hex, size = 1024) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex || '#ffffff';
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Create a square canvas with centered text overlay.
 * @param {string} text - The text to render.
 * @param {number} [size=1024] - Width and height of the canvas in pixels.
 * @returns {HTMLCanvasElement|null
 * } - The created canvas, or null if document is undefined.
 */

export function createTextOverlayCanvas(text, size = 1024) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const pad = size * 0.08;
  const maxTextWidth = size - pad * 2;
  let fontSize = Math.floor(size * 0.12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111';
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = Math.max(2, Math.floor(size * 0.008));
  do {
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxTextWidth) break;
    fontSize -= 2;
  } while (fontSize > 12);
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.strokeText(text, cx, cy);
  ctx.fillText(text, cx, cy);
  ctx.restore();
  return c;
}