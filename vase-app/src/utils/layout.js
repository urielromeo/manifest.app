// Utility to compute vase target positions based on index and layout constants

import * as THREE from 'three';
import { VASE_COLUMNS_COUNT, VASE_SPACING, VASE_TARGET_Y } from '../config/constants';

export function getVaseTarget(idx) {
  const col = idx % VASE_COLUMNS_COUNT;
  const row = Math.floor(idx / VASE_COLUMNS_COUNT);
  const baseY = -row * VASE_SPACING;
  const targetY = baseY + VASE_TARGET_Y;
  return new THREE.Vector3(col * VASE_SPACING, targetY, 0);
}