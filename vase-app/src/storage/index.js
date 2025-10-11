import localforage from 'localforage';

export const vaseStore = localforage.createInstance({
  name: 'manifest-app',
  storeName: 'vases',
});

export const textureStore = localforage.createInstance({
  name: 'manifest-app',
  storeName: 'textures',
});

// Prefer IndexedDB to avoid large-value issues with localStorage fallbacks.
// If IndexedDB is temporarily unavailable, localforage may still fallback; our app adds
// retry logic when reading critical large entries like the skybox.
try {
  // These return promises; fire-and-forget is okay because callers also await .ready()
  vaseStore.setDriver([localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE]);
  textureStore.setDriver([localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE]);
} catch {}
