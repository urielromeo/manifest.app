import localforage from 'localforage';

export const vaseStore = localforage.createInstance({
  name: 'manifest-app',
  storeName: 'vases',
});

export const textureStore = localforage.createInstance({
  name: 'manifest-app',
  storeName: 'textures',
});
