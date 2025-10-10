import { useCallback, useState } from 'react';
import { VASE_COUNT } from '../config/constants.js';

// Manages per-vase design state (texture sources, active base layer, base color, 3D titles)
export default function useVaseDesignState() {
  const [textureSourcesList, setTextureSourcesList] = useState(
    () => Array.from({ length: VASE_COUNT }, () => ({ base: null, upload: null, camera: null, text: null }))
  );
  const [activeBaseLayers, setActiveBaseLayers] = useState(
    () => Array.from({ length: VASE_COUNT }, () => 'base')
  );
  const [baseColors, setBaseColors] = useState(
    () => Array.from({ length: VASE_COUNT }, () => '#ffffff')
  );
  const [titles3D, setTitles3D] = useState(
    () => Array.from({ length: VASE_COUNT }, () => '')
  );

  const setTextureSourcesForVase = useCallback((index, updater) => {
    setTextureSourcesList(prev => prev.map((entry, i) => (i === index ? updater(entry) : entry)));
  }, []);

  const setActiveBaseLayerForVase = useCallback((index, layer) => {
    setActiveBaseLayers(prev => prev.map((l, i) => (i === index ? layer : l)));
  }, []);

  const setBaseColorForVase = useCallback((index, color) => {
    setBaseColors(prev => prev.map((c, i) => (i === index ? color : c)));
  }, []);

  const setTitle3DForVase = useCallback((index, title) => {
    setTitles3D(prev => prev.map((t, i) => (i === index ? title : t)));
  }, []);

  return {
    textureSourcesList,
    activeBaseLayers,
    baseColors,
    titles3D,
    setTextureSourcesForVase,
    setActiveBaseLayerForVase,
    setBaseColorForVase,
    setTitle3DForVase,
    // bulk setters (useful for initialization)
    setTextureSourcesList,
    setActiveBaseLayers,
    setBaseColors,
    setTitles3D,
  };
}
