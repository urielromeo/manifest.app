import React, { useEffect, useRef, useMemo } from "react";
import { useFrame } from '@react-three/fiber';
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import modelUrl from "../assets/models/vase-2-main.glb"; // relative to components/
import shardsModelUrl from "../assets/models/vase-1-shards.glb"; // relative to components/


// Exported so other modules could optionally preload if desired
export const MODEL_URL = modelUrl;

// Preload once at module evaluation time (safe: no hooks here)
useGLTF.preload(MODEL_URL);
useGLTF.preload(shardsModelUrl);

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

    // Ensure matrices are current
    object3D.updateWorldMatrix(true, true);
    const parent = object3D.parent;

    // Build box in WORLD space then convert to PARENT-LOCAL so we can safely edit object3D.position (which is in parent space)
    const worldBox = new THREE.Box3().setFromObject(object3D);
    if (!isFinite(worldBox.min.x)) return; // nothing to bound

    const invParent = new THREE.Matrix4();
    if (parent) {
      parent.updateWorldMatrix(true, true);
      invParent.copy(parent.matrixWorld).invert();
    } else {
      invParent.identity();
    }

    // Convert world box to parent-local space
    const parentLocalBox = worldBox.clone();
    parentLocalBox.min.applyMatrix4(invParent);
    parentLocalBox.max.applyMatrix4(invParent);

    const centerParent = parentLocalBox.getCenter(new THREE.Vector3());

    // Shift only horizontal center in PARENT space
    object3D.position.x -= centerParent.x;
    object3D.position.z -= centerParent.z;

    // Recompute after X/Z shift and again transform the box to parent-local for base alignment
    object3D.updateWorldMatrix(true, true);
    const worldBox2 = new THREE.Box3().setFromObject(object3D);
    const parentLocalBox2 = worldBox2.clone();
    parentLocalBox2.min.applyMatrix4(invParent);
    parentLocalBox2.max.applyMatrix4(invParent);

    const baseOffsetY = parentLocalBox2.min.y; // base in parent space
    object3D.position.y -= baseOffsetY;

    centeredRef.current = true;
  }, [object3D]);
}

/**
 * VaseModel component
 * Props:
 *  - texture: THREE.Texture (optional)
 *  - rotateWithPointer: boolean to enable manual drag rotation (locks camera in parent)
 *  - Destroy/shatter controls
 *  - shattered: boolean
 *  - shatterTriggerId: number
 *  - onShatterComplete: function callback
 *  - Distance-based boost shaping for explosion impulse
 *  // Distance-based boost shaping for explosion impulse
 *  //  - centerOffset: [x, y, z] offset in WORLD space to nudge the blast origin (default [0,0,0])
 *  //  - showBlastGizmo: boolean to draw a small sphere at the explosion center (default false)
 */
export default function VaseModel({
  texture,
  rotateWithPointer = true,
  onVasePointerDown,
  inertialRotation = true, // enable simple momentum effect
  inertiaFriction = 0.92,  // per-frame decay factor (closer to 1 = longer spin)
  minInertiaSpeed = 0.0005, // cutoff to stop updating
  // Destroy/shatter controls
  shattered = false,
  shatterTriggerId = 0,
  onShatterComplete,
  // How long shards simulate before finishing (ms)
  shatterDurationMs = 5000,
  // Distance-based boost shaping for explosion impulse
  // If geometry center/falloff feels off, tweak these (defaults preserve current behavior):
  // distBoost = 1 + clamp( max( (dist + distBias) * distScale, 0 ), distClamp )
  distBias,   // default 0
  distScale,  // default 0.15
  distClamp,  // default 0.5
  centerOffset = [0, 0, 0], // world-space offset for explosion center
  showBlastGizmo = false, // draw a small sphere at the computed explosion center
  children,
}) {
  const { scene: mainScene } = useGLTF(MODEL_URL);
  const { scene: shardsScene } = useGLTF(shardsModelUrl);
  const pivotRef = useRef();
  const dragState = useRef({ dragging: false, lastX: 0, lastY: 0, angularVelocity: 0 });
  const shardsVelRef = useRef(new Map()); // Map<Mesh, { v: Vector3, av: Vector3 }>
  const shardsActiveRef = useRef(false);
  const shatterTimeoutRef = useRef(null);
  const shardsInitialRef = useRef(new Map()); // Map<Mesh, { p: Vector3, q: Quaternion, s: Vector3 }>
  const shardsElapsedRef = useRef(0);   // seconds since current shatter started
  const shardsStartRef = useRef(0);     // performance.now() at shatter start (ms)
  const blastGizmoRef = useRef(null);
  // Track last processed trigger to avoid Strict Mode double-effect re-initialization
  const lastProcessedTriggerRef = useRef(null);

  // Clone the loaded scene so multiple VaseModel instances can coexist & have independent materials.
  const mainInstance = useMemo(() => {
    if (!mainScene) return null;
    const cloned = mainScene.clone(true);
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
  }, [mainScene]);

  const shardsInstance = useMemo(() => {
    if (!shardsScene) return null;
    const cloned = shardsScene.clone(true);
    cloned.traverse((o) => {
      if (o.isMesh) {
        if (Array.isArray(o.material)) {
          o.material = o.material.map(m => m && m.isMaterial ? m.clone() : m);
        } else if (o.material && o.material.isMaterial) {
          o.material = o.material.clone();
        }
        o.frustumCulled = false;
      }
    });
    return cloned;
  }, [shardsScene]);

  // Capture initial local transforms for shards once after creation
  useEffect(() => {
    if (!shardsInstance) return;
    shardsInitialRef.current.clear();
    shardsInstance.traverse((o) => {
      if (o.isMesh) {
        shardsInitialRef.current.set(o, {
          p: o.position.clone(),
          q: o.quaternion.clone(),
          s: o.scale.clone(),
        });
      }
    });
  }, [shardsInstance]);

  // Apply the provided texture (if any) to all mesh materials of the clone only.
  useEffect(() => {
    if (!mainInstance && !shardsInstance) return;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
    }
    const applyTex = (root) => {
      if (!root) return;
      root.traverse((obj) => {
        if (obj.isMesh && obj.material && obj.material.isMaterial) {
          if (texture) {
            obj.material.map = texture;
            obj.material.needsUpdate = true;
          }
        }
      });
    };
    applyTex(mainInstance);
    applyTex(shardsInstance);
  }, [mainInstance, shardsInstance, texture]);

  // Center vase for stable spin (horizontal center at 0, base at y=0) on the cloned instance.
  useCenterForSpin(mainInstance);
  useCenterForSpin(shardsInstance);

  // Initialize shard explosion exactly once per trigger id (Strict Mode safe)
  useEffect(() => {
    if (!shattered || !shardsInstance) return;
    if (lastProcessedTriggerRef.current === shatterTriggerId) { return; };
    lastProcessedTriggerRef.current = shatterTriggerId;

    // Clear any previous timer before starting a new run
    if (shatterTimeoutRef.current) {
      clearTimeout(shatterTimeoutRef.current);
      shatterTimeoutRef.current = null;
    }

    // Restore initial transforms so repeated shatters start from intact shards arrangement
    shardsInitialRef.current.forEach((t, mesh) => {
      if (!mesh) return;
      mesh.position.copy(t.p);
      mesh.quaternion.copy(t.q);
      mesh.scale.copy(t.s);
    });

    // Build a list of mesh children
    const meshes = [];
    shardsInstance.traverse((o) => { if (o.isMesh) meshes.push(o); });

    // Compute approximate center in world space once
    const bbox = new THREE.Box3().setFromObject(shardsInstance);
    const centerWorld = bbox.getCenter(new THREE.Vector3());

    // Manually nudge the explosion center (WORLD space) via prop [x, y, z]
    // Example usage: <VaseModel shattered centerOffset={[0.1, 0.2, -0.05]} />
    if (Array.isArray(centerOffset) && centerOffset.length === 3) {
      centerWorld.add(new THREE.Vector3(centerOffset[0], centerOffset[1], centerOffset[2]));
    } else if (centerOffset && typeof centerOffset === 'object' && 'x' in centerOffset) {
      // also accept a THREE.Vector3-like object
      centerWorld.add(new THREE.Vector3(centerOffset.x || 0, centerOffset.y || 0, centerOffset.z || 0));
    }

    // If requested, position a small gizmo at the explosion center
    if (showBlastGizmo && blastGizmoRef.current) {
      blastGizmoRef.current.position.copy(centerWorld);
      blastGizmoRef.current.visible = true;
    }

    const tmpWorld = new THREE.Vector3();
    const rng = (min, max) => Math.random() * (max - min) + min;

    shardsVelRef.current.clear();
    shardsElapsedRef.current = 0;
    shardsStartRef.current = performance.now();

    // Tunables for "explosion" feel
    const baseStrength = 10.0;   // overall impulse magnitude
    const randJitter   = 10.0;    // random variation added to base strength
    const upBias       = 0.55;   // extra upward kick as a fraction of strength

    meshes.forEach((m) => {
      m.updateWorldMatrix(true, false);

      // Use the shard's GEOMETRY center (in local space), transformed to WORLD space
      let shardCenterWorld = new THREE.Vector3();
      if (m.geometry && m.geometry.attributes && m.geometry.attributes.position) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const localCenter = m.geometry.boundingBox.getCenter(new THREE.Vector3());
        shardCenterWorld.copy(localCenter).applyMatrix4(m.matrixWorld);
      } else {
        // Fallback: mesh origin in world space
        m.getWorldPosition(shardCenterWorld);
      }

      // Direction from epicenter to shard center
      const dir = shardCenterWorld.clone().sub(centerWorld);
      const dist = dir.length();
      if (dist < 1e-5) {
        // Avoid degenerate vectors; randomize slightly
        dir.set(rng(-1, 1), rng(0, 1), rng(-1, 1));
      }
      dir.normalize();

      // Make farther shards get a little more kick (subtle so it feels radial)
      // You can tweak via props: distBias, distScale, distClamp
      // distBoost = 1 + clamp( max( (dist + distBias) * distScale, 0 ), distClamp )
      const effBias = (distBias ?? 10);
      const effScale = (distScale ?? 0.15);
      const effClamp = (distClamp ?? 0.5);
      const scaled = (dist + effBias) * effScale;
      const clamped = Math.min(Math.max(scaled, 0), effClamp);
      const distBoost = 1 + clamped; // default behavior: 1 + min(dist * 0.15, 0.5)
      const strength = (baseStrength + rng(0, randJitter)) * distBoost;

      const v = dir.multiplyScalar(strength);
      v.y += strength * upBias; // upward bias

      const av = new THREE.Vector3(rng(-6, 6), rng(-10, 10), rng(-6, 6));
      shardsVelRef.current.set(m, { v, av });
    });

    shardsActiveRef.current = true;

    // Finish after configured duration
    shatterTimeoutRef.current = setTimeout(() => {
      shardsActiveRef.current = false;
      onShatterComplete && onShatterComplete();
    }, Math.max(0, shatterDurationMs));
  }, [shattered, shatterTriggerId, shardsInstance, onShatterComplete, centerOffset, showBlastGizmo, shatterDurationMs]);

  // Teardown when leaving shattered state or on unmount
  useEffect(() => {
    if (!shattered) {
      if (shatterTimeoutRef.current) {
        clearTimeout(shatterTimeoutRef.current);
        shatterTimeoutRef.current = null;
      }
      shardsActiveRef.current = false;
      shardsElapsedRef.current = 0;
      shardsStartRef.current = 0;
    }
    if (!shattered && blastGizmoRef.current) {
      blastGizmoRef.current.visible = false;
    }
    return () => {
      // On unmount, ensure timers are cleared
      if (shatterTimeoutRef.current) {
        clearTimeout(shatterTimeoutRef.current);
        shatterTimeoutRef.current = null;
      }
      shardsActiveRef.current = false;
      shardsElapsedRef.current = 0;
      shardsStartRef.current = 0;
    };
  }, [shattered]);

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
    if (e.target?.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  // Simple per-frame inertia decay
  useFrame((_, delta) => {
    // Inertia for intact vase
    if (!shattered) {
      if (!inertialRotation || dragState.current.dragging || !pivotRef.current) return;
      let v = dragState.current.angularVelocity;
      if (Math.abs(v) < minInertiaSpeed) {
        dragState.current.angularVelocity = 0;
        return;
      }
      pivotRef.current.rotation.y += v;
      dragState.current.angularVelocity *= inertiaFriction;
    } else {
      // Simple shard physics while shattered
      if (!shardsActiveRef.current || !shardsInstance) return;

      // Advance elapsed time
      shardsElapsedRef.current += delta;

      // Tunables
      const g = 3.8;           // gravity m/s^2
      const blastNoDampFor = 0.08; // seconds with no damping (impulsive feel)
      const gravityDelay  = 0.1;  // seconds before gravity starts
      const linDamp = 0.985;   // linear damping per frame after blast
      const angDamp = 0.09;    // angular damping per frame after blast

      const applyGravity = shardsElapsedRef.current > gravityDelay;
      const applyDamping = shardsElapsedRef.current > blastNoDampFor;

      shardsVelRef.current.forEach((state, mesh) => {
        // integrate
        if (applyGravity) state.v.y -= g * delta;
        mesh.position.x += state.v.x * delta;
        mesh.position.y += state.v.y * delta;
        mesh.position.z += state.v.z * delta;
        // spin
        mesh.rotation.x += state.av.x * delta;
        mesh.rotation.y += state.av.y * delta;
        mesh.rotation.z += state.av.z * delta;
        // dampening (after initial blast window)
        if (applyDamping) {
          state.v.multiplyScalar(linDamp);
          state.av.multiplyScalar(angDamp);
        }
      });
    }
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
      {!shattered && mainInstance && <primitive object={mainInstance} />}
      {shattered && shardsInstance && <primitive object={shardsInstance} />}
      {showBlastGizmo && (
        <mesh ref={blastGizmoRef} visible={false}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color={0xff3333} />
        </mesh>
      )}
      {children}
    </group>
  );
}
