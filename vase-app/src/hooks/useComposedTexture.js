import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * useComposedTexture
 * Composes layered canvas sources into a single THREE.CanvasTexture, reusing GPU resources.
 * Precedence: camera > upload > base (only pass the one you want to be considered for each slot).
 * Text (overlay) is drawn last if provided.
 *
 * Inputs:
 *  - base: HTMLCanvasElement | null
 *  - upload: HTMLCanvasElement | null
 *  - camera: HTMLCanvasElement | null
 *  - text: HTMLCanvasElement | null (overlay)
 *  - fallbackColor: string (used when no base layer present)
 *  - size: number (texture resolution, default 1024)
 *
 * Output:
 *  - texture: THREE.CanvasTexture | null (stable reference; updates in-place)
 */
export function useComposedTexture({ base, upload, camera, text, fallbackColor = '#f8f8f8', size = 1024 }) {
  const canvasRef = useRef(null);
  const textureRef = useRef(null);

  // Lazy create offscreen canvas once
  if (!canvasRef.current && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    const c = canvasRef.current;
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const baseSource = camera || upload || base;
    if (baseSource) {
      ctx.drawImage(baseSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(0, 0, size, size);
    }

    if (text) ctx.drawImage(text, 0, 0, size, size);

    if (!textureRef.current) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.flipY = false;
      textureRef.current = t;
    } else {
      textureRef.current.needsUpdate = true;
    }
  }, [base, upload, camera, text, fallbackColor, size]);

  // Dispose on unmount
  useEffect(() => () => { textureRef.current?.dispose(); }, []);

  return { texture: textureRef.current };
}

export default useComposedTexture;
