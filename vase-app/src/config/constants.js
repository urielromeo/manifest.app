// Configuration constants for the vase app

export const VASE_COUNT = 9;
export const VASE_COLUMNS_COUNT = 3;
export const VASE_SPACING = 25;

export const VASE_TARGET_Y = 4;
export const INITIAL_CAMERA_DISTANCE = 32;
export const CAMERA_HEIGHT = 7;
export const INITIAL_CAMERA_Z = Math.max(
  0,
  Math.sqrt(Math.max(0, INITIAL_CAMERA_DISTANCE**2 - CAMERA_HEIGHT**2))
);

// --- Destroy/shatter tuning ---
// Total time the shattered vase runs before calling onShatterComplete (ms)
export const DESTROY_SHATTER_DURATION_MS = 5000;
// Time window to open the inner sensor so shards/coins can escape (ms)
export const DESTROY_SENSOR_WINDOW_MS = 800;