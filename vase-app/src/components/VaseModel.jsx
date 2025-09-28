import React, { useEffect, useRef } from "react";
import { useFrame } from '@react-three/fiber';
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import modelUrl from "../assets/models/vases-manifest-app.glb"; // relative to components/

// Exported so other modules could optionally preload if desired
export const MODEL_URL = modelUrl;

// Preload once at module evaluation time (safe: no hooks here)
useGLTF.preload(MODEL_URL);

/**
 * Hook: center an Object3D only once by shifting its position so its bounding box center is at origin.
 */
function useCenterOnce(object3D) {
  const centeredRef = useRef(false);
  useEffect(() => {
    if (!object3D || centeredRef.current) return;
    const box = new THREE.Box3().setFromObject(object3D);
    const center = box.getCenter(new THREE.Vector3());
    object3D.position.sub(center);
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

  // Apply the provided texture (if any) to all mesh materials.
  useEffect(() => {
    if (!scene) return;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
    }
    scene.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.isMaterial) {
        if (texture) {
          obj.material.map = texture;
          obj.material.needsUpdate = true;
        }
      }
    });
  }, [scene, texture]);

  // Center the vase once so its pivot is at origin
  useCenterOnce(scene);

  // Pointer drag handlers (rotate around Y axis)
  const onPointerDown = (e) => {
    if (!rotateWithPointer) return;
    e.stopPropagation();
    dragState.current.dragging = true;
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch {}
    }
  };

  const onPointerMove = (e) => {
    if (!rotateWithPointer || !dragState.current.dragging || !pivotRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragState.current.lastX;
    const deltaAngle = dx * 0.01; // sensitivity
    pivotRef.current.rotation.y += deltaAngle;
    dragState.current.angularVelocity = deltaAngle; // store last frame's delta for inertia
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
  };

  const endDrag = (e) => {
    if (!rotateWithPointer) return;
    e.stopPropagation();
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
        e.stopPropagation();
        onVasePointerDown?.();
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerOut={endDrag}
      onPointerCancel={endDrag}
    >
      {scene && <primitive object={scene} />}
    </group>
  );
}
