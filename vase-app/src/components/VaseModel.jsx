import React, { useEffect, useRef, useMemo } from "react";
import { useFrame } from '@react-three/fiber';
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import modelUrl from "../assets/models/vases-manifest-app.glb"; // relative to components/

// Exported so other modules could optionally preload if desired
export const MODEL_URL = modelUrl;

// Preload once at module evaluation time (safe: no hooks here)
useGLTF.preload(MODEL_URL);

/**
 * Hook: center the model for clean Y-axis rotation.
 * Strategy:
 *  - Compute full bounding box once.
 *  - Shift ONLY X & Z so horizontal center sits at (0,0).
 *  - Lift / lower Y so the base (minY) rests at y = 0 (feels grounded while spinning).
 * This avoids wobble caused by off-axis pivot while keeping the vase "standing" instead of
 * rotating around its vertical midpoint.
 */
function useCenterForSpin(object3D) {
  const centeredRef = useRef(false);
  useEffect(() => {
    if (!object3D || centeredRef.current) return;

    // Aggregate bounding box across visible meshes only (ignores empties / helpers)
    const box = new THREE.Box3();
    let hasMesh = false;
    object3D.traverse(child => {
      if (child.isMesh && child.visible && child.geometry) {
        const childBox = new THREE.Box3().setFromObject(child);
        if (!hasMesh) {
          box.copy(childBox);
          hasMesh = true;
        } else {
          box.union(childBox);
        }
      }
    });
    if (!hasMesh) return;

    const center = box.getCenter(new THREE.Vector3());

    // Shift only horizontal center
    object3D.position.x -= center.x;
    object3D.position.z -= center.z;

    // Recompute after X/Z shift to find new minY, then lift base to y=0
    const shiftedBox = new THREE.Box3().setFromObject(object3D);
    const baseOffset = shiftedBox.min.y; // if negative, raise; if positive, lower
    object3D.position.y -= baseOffset;

    centeredRef.current = true;
  }, [object3D]);
}

/**
 * VaseModel component
 * Props:
 *  - texture: THREE.Texture (optional)
 *  - rotateWithPointer: boolean to enable manual drag rotation (locks camera in parent)
 */
export default function VaseModel({
  texture,
  rotateWithPointer = true,
  onVasePointerDown,
  inertialRotation = true, // enable simple momentum effect
  inertiaFriction = 0.92,  // per-frame decay factor (closer to 1 = longer spin)
  minInertiaSpeed = 0.0005 // cutoff to stop updating
}) {
  const { scene } = useGLTF(MODEL_URL);
  const pivotRef = useRef();
  const dragState = useRef({ dragging: false, lastX: 0, lastY: 0, angularVelocity: 0 });

  // Clone the loaded scene so multiple VaseModel instances can coexist & have independent materials.
  const instance = useMemo(() => {
    if (!scene) return null;
    const cloned = scene.clone(true);
    // Ensure unique material instances for per-vase texture changes.
    cloned.traverse((o) => {
      if (o.isMesh) {
        if (Array.isArray(o.material)) {
          o.material = o.material.map(m => m && m.isMaterial ? m.clone() : m);
        } else if (o.material && o.material.isMaterial) {
          o.material = o.material.clone();
        }
        // Slight safety: disable frustum culling for complex centered object if needed
        o.frustumCulled = false;
      }
    });
    return cloned;
  }, [scene]);

  // Apply the provided texture (if any) to all mesh materials of the clone only.
  useEffect(() => {
    if (!instance) return;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
    }
    instance.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.isMaterial) {
        if (texture) {
          obj.material.map = texture;
          obj.material.needsUpdate = true;
        }
      }
    });
  }, [instance, texture]);

  // Center vase for stable spin (horizontal center at 0, base at y=0) on the cloned instance.
  useCenterForSpin(instance);

  // Pointer drag handlers (rotate around Y axis)
  const onPointerDown = (e) => {
    if (!rotateWithPointer) return;
    // Only stop propagation if this vase should capture interaction
    if (rotateWithPointer) e.stopPropagation();
    dragState.current.dragging = true;
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
  };

  const onPointerMove = (e) => {
    if (!rotateWithPointer || !dragState.current.dragging || !pivotRef.current) return;
    if (rotateWithPointer) e.stopPropagation();
    const dx = e.clientX - dragState.current.lastX;
    const deltaAngle = dx * 0.01; // sensitivity
    pivotRef.current.rotation.y += deltaAngle;
    dragState.current.angularVelocity = deltaAngle; // store last frame's delta for inertia
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
  };

  const endDrag = (e) => {
    if (!rotateWithPointer) return;
    if (rotateWithPointer) e.stopPropagation();
    dragState.current.dragging = false;
    // If movement was minimal, zero out inertia so it doesn't feel jumpy
    if (Math.abs(dragState.current.angularVelocity) < 0.0001) {
      dragState.current.angularVelocity = 0;
    }
    if (e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  // Simple per-frame inertia decay
  useFrame(() => {
    if (!inertialRotation || dragState.current.dragging || !pivotRef.current) return;
    let v = dragState.current.angularVelocity;
    if (Math.abs(v) < minInertiaSpeed) {
      dragState.current.angularVelocity = 0;
      return;
    }
    pivotRef.current.rotation.y += v;
    dragState.current.angularVelocity *= inertiaFriction;
  });

  return (
    <group
      ref={pivotRef}
      onPointerDown={(e) => {
        // Stop propagation only if interactive (rotate) or explicit handler wants exclusive control
        if (rotateWithPointer || onVasePointerDown) e.stopPropagation();
        onVasePointerDown?.();
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerOut={endDrag}
      onPointerCancel={endDrag}
    >
      {instance && <primitive object={instance} />}
    </group>
  );
}
