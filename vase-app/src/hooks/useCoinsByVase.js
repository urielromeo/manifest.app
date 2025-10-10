import { useCallback, useState } from 'react';
import { VASE_COUNT } from '../config/constants.js';

export default function useCoinsByVase() {
  const [coinsByVase, setCoinsByVase] = useState(() => Array.from({ length: VASE_COUNT }, () => []));

  const spawnCoinForVase = useCallback((vaseIndex) => {
    setCoinsByVase(prev => {
      const list = prev.map(arr => arr.slice());
      const id = Date.now() + Math.random();
      const position = [
        (Math.random() - 0.5) * 0.6,
        15,
        (Math.random() - 0.5) * 0.6,
      ];
      const rotation = [
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      ];
      list[vaseIndex].push({ id, position, rotation });
      return list;
    });
  }, []);

  const clearCoinsForVase = useCallback((vaseIndex) => {
    setCoinsByVase(prev => prev.map((arr, i) => (i === vaseIndex ? [] : arr)));
  }, []);

  return { coinsByVase, spawnCoinForVase, setCoinsByVase, clearCoinsForVase };
}
