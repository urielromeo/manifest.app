import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import VaseModel, { MODEL_URL } from "./components/VaseModel.jsx";
import FloatingTitle3D from "./components/FloatingTitle3D.jsx";
import Sidebars from './components/Sidebars.jsx';
import useComposedTexture from './hooks/useComposedTexture.js';

const BOUNDS_MARGIN = 2.15; // (kept for potential future use)
// Multi-vase configuration
const VASE_COUNT = 2; // Adjust this number to render more or fewer vases
const VASE_SPACING = 25; // Fixed X distance between consecutive vases

// --- Helper component for camera reset animation ---
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3); // hoisted to avoid re-allocation each frame
function CameraResetAnimator({ controlsRef, resetRef, onDone }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const data = resetRef.current;
    if (!data) return;
    data.elapsed += delta;
    const t = Math.min(data.elapsed / data.duration, 1);
    const k = easeOutCubic(t);

    camera.position.lerpVectors(data.fromPos, data.toPos, k);
    controlsRef.current.target.lerpVectors(data.fromTarget, data.toTarget, k);
    controlsRef.current.update();

    // Early finish tolerance: once we're past a minimum progress and within distance epsilon, snap & finish.
    if (
      t >= 1 ||
      (t >= data.minProgressForEarlyEnd &&
        camera.position.distanceToSquared(data.toPos) <= data.posEpsSq &&
        controlsRef.current.target.distanceToSquared(data.toTarget) <= data.targetEpsSq)
    ) {
      // Snap to exact final values to avoid residual drift
      camera.position.copy(data.toPos);
      controlsRef.current.target.copy(data.toTarget);
      controlsRef.current.update();
      resetRef.current = null;
      onDone();
    }
  });
  return null;
}

export default function App() {
  // Per-vase texture source stacks & metadata
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
  const [activeAction, setActiveAction] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [activeVaseIndex, setActiveVaseIndex] = useState(0); // which vase camera is focused on
  // Mobile layout adjustment
  const bottomBarRef = useRef(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  // Interaction state
  const [draggingMode, setDraggingMode] = useState(null); // 'vase' | 'camera' | null
  const [isResetting, setIsResetting] = useState(false);

  const controlsRef = useRef(null);

  // Defaults & reset helpers
  const defaultCamPos = useRef(new THREE.Vector3(0, 1, 6));
  const defaultTarget = useRef(new THREE.Vector3(0, 0, 0));
  const defaultDir = useRef(
    defaultCamPos.current.clone().sub(defaultTarget.current).normalize()
  );
  // Preserve full initial offset vector (not just direction) so we can reuse exact relative framing.
  const defaultOffset = useRef(
    defaultCamPos.current.clone().sub(defaultTarget.current)
  );
  const resetRef = useRef(null);

  const startCameraReset = useCallback(() => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    const currentOffset = cam.position.clone().sub(controlsRef.current.target);
    // If user has changed distance, honor new length but keep direction = defaultDir
    const dist = currentOffset.length();
    const toPos = defaultTarget.current.clone().add(defaultDir.current.clone().multiplyScalar(dist));
    resetRef.current = {
      fromPos: cam.position.clone(),
      toPos,
      fromTarget: controlsRef.current.target.clone(),
      toTarget: defaultTarget.current.clone(),
      elapsed: 0,
      duration: 0.9,
      posEpsSq: 0.05 * 0.05,
      targetEpsSq: 0.025 * 0.025,
      minProgressForEarlyEnd: 0.55,
    };
    setIsResetting(true);
  }, []);

  // Focus camera on a given vase index (wrap-around) while preserving current distance & view direction
  const focusVase = useCallback((index) => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    const wrapped = ((index % VASE_COUNT) + VASE_COUNT) % VASE_COUNT;
    if (wrapped === activeVaseIndex) return;
    const newTarget = new THREE.Vector3(wrapped * VASE_SPACING, 0, 0);
    // Preserve current offset vector (camera relative location) to keep orientation & distance stable
    const offset = cam.position.clone().sub(controlsRef.current.target);
    const toPos = newTarget.clone().add(offset);
    // Update persistent defaults (direction & offset) for subsequent resets
    defaultTarget.current.copy(newTarget);
    defaultDir.current.copy(offset.clone().normalize());
    defaultOffset.current.copy(offset);
    resetRef.current = {
      fromPos: cam.position.clone(),
      toPos,
      fromTarget: controlsRef.current.target.clone(),
      toTarget: newTarget.clone(),
      elapsed: 0,
      duration: 0.7,
      posEpsSq: 0.05 * 0.05,
      targetEpsSq: 0.025 * 0.025,
      minProgressForEarlyEnd: 0.5,
    };
    setActiveVaseIndex(wrapped);
    setIsResetting(true);
    setDraggingMode(null);
  }, [activeVaseIndex]);

  // Keyboard navigation between vases
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        focusVase(activeVaseIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        focusVase(activeVaseIndex - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusVase, activeVaseIndex]);

  // Helpers to update per-vase structures
  const setTextureSourcesForVase = useCallback((index, updater) => {
    setTextureSourcesList(prev => prev.map((entry, i) => i === index ? updater(entry) : entry));
  }, []);
  const setActiveBaseLayerForVase = useCallback((index, layer) => {
    setActiveBaseLayers(prev => prev.map((l, i) => i === index ? layer : l));
  }, []);
  const setBaseColorForVase = useCallback((index, color) => {
    setBaseColors(prev => prev.map((c, i) => i === index ? color : c));
  }, []);
  const setTitle3DForVase = useCallback((index, title) => {
    setTitles3D(prev => prev.map((t, i) => i === index ? title : t));
  }, []);

  // Compose textures for each vase (could optimize with memoization; fine for small counts)
  const composedTextures = textureSourcesList.map((srcs, i) => {
    const activeLayer = activeBaseLayers[i];
    const baseParam = activeLayer === 'base' ? srcs.base : null;
    const uploadParam = activeLayer === 'upload' ? srcs.upload : null;
    const cameraParam = activeLayer === 'camera' ? srcs.camera : null;
    return useComposedTexture({
      base: baseParam,
      upload: uploadParam,
      camera: cameraParam,
      text: srcs.text,
      fallbackColor: '#f8f8f8',
      size: 1024,
    }).texture;
  });

  const defaultTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, 2, 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.flipY = false;
    return tex;
  }, []);

  // Track zoom distance
  const handleControlsChange = useMemo(() => {
    let scheduled = false;
    return () => {
      if (!controlsRef.current || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const distance = controlsRef.current.getDistance();
        setCurrentZoom(distance);
      });
    };
  }, []);

  // Preload model (side-effect belongs in useEffect, not useMemo)
  useEffect(() => {
    useGLTF.preload(MODEL_URL);
  }, []);

  useEffect(() => {
    console.info("[App] Using MODEL_URL:", MODEL_URL);
  }, []);

  // Measure mobile bottom bar to keep vase centered in visible area (not hidden behind overlay)
  useEffect(() => {
    const update = () => {
      if (window.innerWidth <= 768 && bottomBarRef.current) {
        setBottomBarHeight(bottomBarRef.current.offsetHeight);
      } else {
        setBottomBarHeight(0);
      }
    };
    update();
    window.addEventListener('resize', update);
    let ro;
    if (window.ResizeObserver && bottomBarRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(bottomBarRef.current);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, []);

  // Pointer logic
  const handleCanvasPointerDown = useCallback(() => {
    // If we're not currently dragging the vase and not resetting, enter camera mode
    if (draggingMode === null && !isResetting) setDraggingMode("camera");
  }, [draggingMode, isResetting]);

  // Global pointerup to finalize drags
  useEffect(() => {
    const up = () => {
      if (draggingMode === "camera") {
        // Start reset back to default orientation (keep distance)
        startCameraReset();
      } else if (draggingMode === "vase") {
        setDraggingMode(null);
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [draggingMode, startCameraReset]);

  const handleVasePointerDown = useCallback((e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isResetting) return;
    setDraggingMode("vase");
  }, [isResetting]);

  // Extra safety: if pointer gets canceled or window/tab loses focus, gracefully end drag
  useEffect(() => {
    const cancel = () => {
      if (draggingMode === "camera") {
        startCameraReset();
      } else if (draggingMode === "vase") {
        setDraggingMode(null);
      }
    };
    const handleVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [draggingMode, startCameraReset]);

  // Keep OrbitControls mounted & active so first pointer move rotates immediately.
  // We dynamically enable/disable rotate & pan based on draggingMode to avoid
  // missing the initial pointerdown event when we previously relied on props.
  useEffect(() => {
    if (!controlsRef.current) return;
    const allowCamera = draggingMode !== "vase" && !isResetting;
    controlsRef.current.enableRotate = allowCamera;
    controlsRef.current.enablePan = allowCamera;
  }, [draggingMode, isResetting]);

  return (
    <div style={{ width: "100vw", height: "100svh", overflow: "hidden" }}>
      <Sidebars
        ref={bottomBarRef}
        activeVaseIndex={activeVaseIndex}
        titles3D={titles3D}
        setTextureSourcesForVase={setTextureSourcesForVase}
        setActiveBaseLayerForVase={setActiveBaseLayerForVase}
        setBaseColorForVase={setBaseColorForVase}
        setTitle3DForVase={setTitle3DForVase}
        activeAction={activeAction}
        setActiveAction={setActiveAction}
      />

      {/* Debug Stats */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          zIndex: 10,
          background: "rgba(0,0,0,0.7)",
          padding: 8,
          borderRadius: 4,
          color: "white",
          fontSize: 12,
          fontFamily: "monospace",
        }}
      >
        current zoom: {currentZoom.toFixed(2)} | mode: {draggingMode || "idle"} | active vase: {activeVaseIndex}
        {isResetting ? " (resetting)" : ""}
      </div>

      <div
        style={{
          position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            // Reduce height by mobile bar height so visual center stays true
            height: bottomBarHeight ? `calc(100svh - ${bottomBarHeight}px)` : '100svh',
            overflow: 'hidden'
        }}
      >
        <Canvas
          camera={{ position: [0, 1, 6], fov: 50 }}
          onPointerDown={handleCanvasPointerDown}
        >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 2]} intensity={1} />
        <Suspense fallback={null}>
          {/* Without <Bounds>, we manage camera focusing manually */}
          {Array.from({ length: VASE_COUNT }).map((_, i) => {
            const isActive = i === activeVaseIndex;
            return (
              <group
                key={i}
                position={[i * VASE_SPACING, 0, 0]}
                {...(!isActive && {
                  onPointerDown: (e) => e.stopPropagation(),
                  onPointerMove: (e) => e.stopPropagation(),
                  onPointerUp: (e) => e.stopPropagation(),
                  onPointerCancel: (e) => e.stopPropagation(),
                  onPointerOut: (e) => e.stopPropagation(),
                })}
              >
                <VaseModel
                  texture={composedTextures[i] || defaultTexture}
                  rotateWithPointer={isActive}
                  onVasePointerDown={isActive ? handleVasePointerDown : undefined}
                />
                {titles3D[i] && (
                  <FloatingTitle3D
                    title={titles3D[i]}
                    color={baseColors[i]}
                    position={[0, -8, 0]}
                  />
                )}
              </group>
            );
          })}
        </Suspense>
        {/* Removed single global title; per-vase titles handled inline */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            // Rotation & pan gating handled via effect to avoid missing initial drag
            enableRotate
            enablePan
            enableZoom={true}
            minDistance={3}
            maxDistance={75}
            onChange={handleControlsChange}
          />

          <CameraResetAnimator
            controlsRef={controlsRef}
            resetRef={resetRef}
            onDone={() => {
              setIsResetting(false);
              setDraggingMode(null);
            }}
          />
        </Canvas>
      </div>
    </div>
  );
}