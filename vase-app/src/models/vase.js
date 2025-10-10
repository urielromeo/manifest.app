// JSDoc-typed data model for Vase objects (no TypeScript required)

/**
 * @typedef {Object} TextureRef
 * @property {string} id        // e.g. "tex:sha256:abc123..."
 * @property {string} mime      // "image/png" | "image/jpeg" | "image/webp"
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {'base'|'upload'|'camera'} BaseLayer
 */

/**
 * @typedef {Object} Vase
 * @property {string} id                  // stable uid, e.g. "vase-0001"
 * @property {1} version                  // schema version for migrations
 * @property {string} createdAt           // ISO date
 * @property {string} updatedAt           // ISO date
 * @property {{ destroyCount: number, coinAmount: number }} stats
 * @property {{ bottomText: string, vaseText: string }} labels
 * @property {{
 *   baseColor: string,
 *   activeBaseLayer: BaseLayer,
 *   textureSlots: {
 *     base?: TextureRef,
 *     upload?: TextureRef,
 *     camera?: TextureRef,
 *     textOverlay?: string
 *   }
 * }} appearance
 */

/**
 * Create a new Vase with sane defaults.
 * @param {Partial<Vase> & { id: string }} init
 * @returns {Vase}
 */
export function createVase(init) {
  const now = new Date().toISOString();
  return {
    id: init.id,
    version: 1,
    createdAt: init.createdAt ?? now,
    updatedAt: init.updatedAt ?? now,
    stats: {
      destroyCount: init.stats?.destroyCount ?? 0,
      coinAmount: init.stats?.coinAmount ?? 0,
    },
    labels: {
      bottomText: init.labels?.bottomText ?? '',
      vaseText: init.labels?.vaseText ?? '',
    },
    appearance: {
      baseColor: init.appearance?.baseColor ?? '#ffffff',
      activeBaseLayer: init.appearance?.activeBaseLayer ?? 'base',
      textureSlots: {
        base: init.appearance?.textureSlots?.base,
        upload: init.appearance?.textureSlots?.upload,
        camera: init.appearance?.textureSlots?.camera,
        textOverlay: init.appearance?.textureSlots?.textOverlay,
      },
    },
  };
}

/**
 * Update a Vase and bump updatedAt.
 * @param {Vase} vase
 * @param {Partial<Vase>} patch
 * @returns {Vase}
 */
export function updateVase(vase, patch) {
  return {
    ...vase,
    ...patch,
    stats: { ...vase.stats, ...patch.stats },
    labels: { ...vase.labels, ...patch.labels },
    appearance: {
      ...vase.appearance,
      ...patch.appearance,
      textureSlots: {
        ...vase.appearance.textureSlots,
        ...(patch.appearance?.textureSlots ?? {}),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}
