import { vaseStore } from '../storage/index.js';
import { createVase, updateVase } from '../models/vase.js';

const VASE_COUNT = 9;

/**
 * Try to read vases array from storage. If none, create 9 defaults and persist once.
 * Returns an array of Vase.
 * No autosave beyond the initial seeding.
 * @returns {Promise<import('../models/vase.js').Vase[]>}
 */
export async function loadOrInitVases() {
  try {
    const existing = await vaseStore.getItem('all');
    if (Array.isArray(existing) && existing.length) {
      // lightweight migration: ensure name exists
      const migrated = existing.map(v => ({ name: '', ...v }));
      if (migrated.some((v, i) => v.name !== existing[i].name)) {
        try { await vaseStore.setItem('all', migrated); } catch {}
      }
      return migrated;
    }
  } catch (e) {
    // If read fails, fall through to init defaults
    console.warn('[vases] failed reading storage, initializing defaults', e);
  }

  // Seed defaults
  const vases = Array.from({ length: VASE_COUNT }, (_, i) =>
    createVase({ id: `vase-${String(i + 1).padStart(4, '0')}` })
  );

  try {
    await vaseStore.setItem('all', vases);
  } catch (e) {
    console.warn('[vases] failed seeding defaults to storage (continuing in-memory)', e);
  }
  return vases;
}

/**
 * Map Vase[] to the current App.jsx UI state shapes.
 * This function does not write to storage.
 */
export function mapVasesToUiState(vases) {
  const textureSourcesList = vases.map(v => ({
    base: v.appearance.textureSlots.base ?? null,
    upload: v.appearance.textureSlots.upload ?? null,
    camera: v.appearance.textureSlots.camera ?? null,
    text: v.appearance.textureSlots.textOverlay ?? null,
  }));
  const activeBaseLayers = vases.map(v => v.appearance.activeBaseLayer);
  const baseColors = vases.map(v => v.appearance.baseColor);
  const titles3D = vases.map(v => v.labels.vaseText || '');
  const isGlassList = vases.map(v => !!v.appearance.isGlass);
  return { textureSourcesList, activeBaseLayers, baseColors, titles3D, isGlassList };
}

/** Persist entire vases array */
export async function saveVases(vases) {
  try {
    await vaseStore.setItem('all', vases);
  } catch (e) {
    console.warn('[vases] failed saving to storage', e);
  }
}

/** Update one vase by index and persist; returns updated array */
export async function updateVaseAt(vases, index, patch) {
  const next = vases.map((v, i) => (i === index ? updateVase(v, patch) : v));
  await saveVases(next);
  return next;
}
