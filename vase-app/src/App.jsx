import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback, useContext } from "react";
import "./App.css";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import VaseModel, { MODEL_URL } from "./components/VaseModel.jsx";
import FloatingTitle3D from "./components/FloatingTitle3D.jsx";
import Sidebars from './components/Sidebars.jsx';
import useComposedTexture from './hooks/useComposedTexture.js';
import Coin from './components/Coin.jsx';
import Test1Page from './components/Test1.jsx';

export const VaseShatterContext = React.createContext({ phase: 'idle', center: [0,0,0], trigger: 0 });

const BOUNDS_MARGIN = 2.15; // (kept for potential future use)


// Multi-vase configuration
const VASE_COUNT = 9; // Adjust this number to render more or fewer vases
const VASE_COLUMNS_COUNT = 3; // Number of columns before wrapping to a new row
const VASE_SPACING = 20; // Horizontal (X) and vertical (Y) spacing between vases in the grid

// Camera / focus tuning
// Keep target at vase base (y=0), but raise the camera itself.
const VASE_TARGET_Y = 4; // look-at stays here
const INITIAL_CAMERA_DISTANCE = 28; // desired radial distance (reported as zoom)
const CAMERA_HEIGHT = 7; // how high above target the camera sits
// Compute Z so that sqrt(CAMERA_HEIGHT^2 + z^2) === INITIAL_CAMERA_DISTANCE, preserving displayed zoom value.
const INITIAL_CAMERA_Z = Math.max(0, Math.sqrt(Math.max(0, INITIAL_CAMERA_DISTANCE * INITIAL_CAMERA_DISTANCE - CAMERA_HEIGHT * CAMERA_HEIGHT)));

// Title scene camera/target (kept far away so both scenes render simultaneously)
const TITLE_TARGET = new THREE.Vector3(0, 4, -100);
const TITLE_CAMERA_POS = new THREE.Vector3(0, 7, -92);

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
  const isTest1 = typeof window !== 'undefined' && window.location.pathname === '/test-1';
  if (isTest1) return <Test1Page />;
  // App mode: title screen vs vases
  const [appMode, setAppMode] = useState('title'); // 'title' | 'vases'
  const [isConnecting, setIsConnecting] = useState(false);
  const connectTimerRef = useRef(null);
  // Optional hook to run custom logic after a camera reset/transition completes
  const onResetDoneOnceRef = useRef(null);
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
  const [currentZoom, setCurrentZoom] = useState(INITIAL_CAMERA_DISTANCE);
  const [activeVaseIndex, setActiveVaseIndex] = useState(0); // which vase camera is focused on
  // Destroy/shatter orchestration
  const [isLocked, setIsLocked] = useState(false); // lock UI and camera during destroy window
  const [destroyingIndex, setDestroyingIndex] = useState(null);
  const [destroyEventId, setDestroyEventId] = useState(0);
  // Per-vase temporary sensor window so shards can escape but coins still collide after
  const [vaseSensorWindows, setVaseSensorWindows] = useState(() => Array.from({ length: VASE_COUNT }, () => false));
  const sensorTimersRef = useRef({});
  // Track per-vase destroy in-progress to prevent duplicate triggers (e.g., React StrictMode double effects)
  const destroyingVasesRef = useRef(new Set());
  // Coins per vase (simple: each coin has id, position [x,y,z], rotation [x,y,z])
  const [coinsByVase, setCoinsByVase] = useState(() => Array.from({ length: VASE_COUNT }, () => []));
  // Simple per-vase coin spawner (like Test1)
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
  // Debug: toggle Rapier collider wireframes
  const [debugPhysics, setDebugPhysics] = useState(false);
  // Mobile layout adjustment
  const bottomBarRef = useRef(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  // Interaction state
  const [draggingMode, setDraggingMode] = useState(null); // 'vase' | 'camera' | null
  const [isResetting, setIsResetting] = useState(false);

  const controlsRef = useRef(null);

  // Defaults & reset helpers
  // Set initial camera so its radial distance to target is INITIAL_CAMERA_DISTANCE while being raised by CAMERA_HEIGHT.
  const defaultTarget = useRef(new THREE.Vector3(0, VASE_TARGET_Y, 0));
  const defaultCamPos = useRef(new THREE.Vector3(0, CAMERA_HEIGHT, INITIAL_CAMERA_Z));
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
  // Helper to compute vase target position from index (grid layout)
  const getVaseTarget = useCallback((idx) => {
    const col = idx % VASE_COLUMNS_COUNT;
    const row = Math.floor(idx / VASE_COLUMNS_COUNT);
    // Arrange vases downward along -Y (screen vertical) instead of pushing back on Z.
    // Target's Y should remain VASE_TARGET_Y units above the vase group's base Y.
    const baseY = -row * VASE_SPACING; // group Y position
    const targetY = baseY + VASE_TARGET_Y;
    return new THREE.Vector3(col * VASE_SPACING, targetY, 0);
  }, []);


  // Smooth transition from title camera to current vase view
  const startTitleToVasesTransition = useCallback(() => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    const newTarget = getVaseTarget(activeVaseIndex);
    const offset = defaultOffset.current.clone(); // preserve standard distance/orientation for vase view
    const toPos = newTarget.clone().add(offset);
    // Update defaults to the vase view going forward
    defaultTarget.current.copy(newTarget);
    defaultDir.current.copy(offset.clone().normalize());
    // Animate camera and controls target
    resetRef.current = {
      fromPos: cam.position.clone(),
      toPos,
      fromTarget: controlsRef.current.target.clone(),
      toTarget: newTarget.clone(),
      elapsed: 0,
      duration: 1.2,
      posEpsSq: 0.05 * 0.05,
      targetEpsSq: 0.025 * 0.025,
      minProgressForEarlyEnd: 0.55,
    };
    setIsResetting(true);
  }, [activeVaseIndex, getVaseTarget]);

 
  const focusVase = useCallback((index) => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    const wrapped = ((index % VASE_COUNT) + VASE_COUNT) % VASE_COUNT;
    if (wrapped === activeVaseIndex) return;
    const newTarget = getVaseTarget(wrapped);
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
  }, [activeVaseIndex, getVaseTarget]);

  // Keyboard navigation between vases and simple coin spawn on Space
  useEffect(() => {
    if (appMode !== 'vases') return; // disable during title
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        focusVase(activeVaseIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        focusVase(activeVaseIndex - 1);
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!isLocked) spawnCoinForVase(activeVaseIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appMode, focusVase, activeVaseIndex, isLocked, spawnCoinForVase]);

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

  // Trigger manifest: spawn a coin above the active vase
  

  // Trigger manifest via sidebar action: spawn one coin above the active vase
  useEffect(() => {
    if (activeAction !== 'manifest') return;
    if (!isLocked) spawnCoinForVase(activeVaseIndex);
    setActiveAction(null);
  }, [activeAction, activeVaseIndex, isLocked, spawnCoinForVase]);

  // Trigger destroy when action becomes 'destroy' and we're not already locked
  useEffect(() => {
    if (activeAction !== 'destroy') return;
    // Only allow when not locked
    if (isLocked || destroyingIndex !== null) {
      setActiveAction(null);
      return;
    }
    // Prevent re-entry for the same vase even if this effect runs more than once
    const idx = activeVaseIndex;
    if (destroyingVasesRef.current.has(idx)) {
      setActiveAction(null);
      return;
    }
    destroyingVasesRef.current.add(idx);
    // Start destroy on current active vase
    setIsLocked(true);
    setDestroyingIndex(idx);
    setDestroyEventId((id) => id + 1);
    // Open a short sensor window on this vase so shards/coins can blow outward, then restore solid walls
    setVaseSensorWindows(prev => prev.map((v, i) => i === idx ? true : v));
    // Clear any previous timer for this vase index
    if (sensorTimersRef.current[idx]) {
      clearTimeout(sensorTimersRef.current[idx]);
    }
    sensorTimersRef.current[idx] = setTimeout(() => {
      setVaseSensorWindows(prev => prev.map((v, i) => i === idx ? false : v));
      delete sensorTimersRef.current[idx];
    }, 800); // ~0.8s window
    // Clear the action button selection immediately
    setActiveAction(null);
  }, [activeAction, isLocked, destroyingIndex, activeVaseIndex]);

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
    if (isLocked || appMode !== 'vases') return;
    if (draggingMode === null && !isResetting) setDraggingMode("camera");
  }, [draggingMode, isResetting, isLocked, appMode]);

  // Global pointerup to finalize drags
  useEffect(() => {
    const up = () => {
      if (isLocked || appMode !== 'vases') return;
      if (draggingMode === "camera") {
        // Start reset back to default orientation (keep distance)
        startCameraReset();
      } else if (draggingMode === "vase") {
        setDraggingMode(null);
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [draggingMode, startCameraReset, isLocked, appMode]);

  const handleVasePointerDown = useCallback((e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isResetting || isLocked || appMode !== 'vases') return;
    setDraggingMode("vase");
  }, [isResetting, isLocked, appMode]);

  // Extra safety: if pointer gets canceled or window/tab loses focus, gracefully end drag
  useEffect(() => {
    const cancel = () => {
      if (isLocked || appMode !== 'vases') return;
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
  }, [draggingMode, startCameraReset, isLocked, appMode]);

  // Keep OrbitControls mounted & active so first pointer move rotates immediately.
  // We dynamically enable/disable rotate & pan based on draggingMode to avoid
  // missing the initial pointerdown event when we previously relied on props.
  useEffect(() => {
    if (!controlsRef.current) return;
    const allowCamera = appMode === 'vases' && draggingMode !== "vase" && !isResetting && !isLocked;
    controlsRef.current.enableRotate = allowCamera;
    controlsRef.current.enablePan = allowCamera;
    controlsRef.current.enableZoom = allowCamera;
  }, [draggingMode, isResetting, isLocked, appMode]);

  // Prevent keyboard vase switching when locked
  useEffect(() => {
    const onKey = (e) => {
      if (!isLocked) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isLocked]);

  // Debug key: press "d" to toggle collider wireframes
  // Disabled global "d" toggle to avoid accidental debug enablement.
  // useEffect(() => {
  //   const onKey = (e) => {
  //     if (e.key.toLowerCase() === 'd' && !e.repeat) {
  //       setDebugPhysics((v) => !v);
  //     }
  //   };
  //   window.addEventListener('keydown', onKey);
  //   return () => window.removeEventListener('keydown', onKey);
  // }, []);

  return (
    <div style={{ width: "100vw", height: "100svh", overflow: "hidden" }}>
      {appMode === 'vases' && (
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
          disabled={isLocked}
        />
      )}

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
        <button
          onClick={() => setDebugPhysics(v => !v)}
          style={{ marginLeft: 8, padding: '2px 6px', fontSize: 11 }}
        >
          physics: {debugPhysics ? 'on' : 'off'}
        </button>
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
          camera={{ position: appMode === 'title' ? [TITLE_CAMERA_POS.x, TITLE_CAMERA_POS.y, TITLE_CAMERA_POS.z] : [0, CAMERA_HEIGHT, INITIAL_CAMERA_Z], fov: 50 }}
          onPointerDown={handleCanvasPointerDown}
        >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 2]} intensity={1} />
        <Physics
          colliders={false}
          gravity={[0, -9.81, 0]}
          debug={debugPhysics}
          timeStep={1/90} // smaller fixed timestep improves collision stability
          interpolation={true}
        >
        <Suspense fallback={null}>
          {/* Without <Bounds>, we manage camera focusing manually */}
          {Array.from({ length: VASE_COUNT }).map((_, i) => {
            const isActive = i === activeVaseIndex;
            const col = i % VASE_COLUMNS_COUNT;
            const row = Math.floor(i / VASE_COLUMNS_COUNT);
            const x = col * VASE_SPACING;
            const y = -row * VASE_SPACING; // move downward instead of backward
            return (
              <group
                key={i}
                position={[x, y, 0]}
                {...(!isActive && {
                  onPointerDown: (e) => { e.stopPropagation(); focusVase(i); },
                  onPointerMove: (e) => e.stopPropagation(),
                  onPointerUp: (e) => e.stopPropagation(),
                  onPointerCancel: (e) => e.stopPropagation(),
                  onPointerOut: (e) => e.stopPropagation(),
                })}
              >
                <VaseShatterContext.Provider value={{
                  phase: destroyingIndex === i ? 'exploding' : 'idle',
                  center: [x, y, 0],
                  trigger: destroyEventId,
                }}>
                  <RigidBody type="fixed" colliders="trimesh">
                    <VaseModel
                      texture={composedTextures[i] || defaultTexture}
                      rotateWithPointer={isActive}
                      onVasePointerDown={isActive ? handleVasePointerDown : undefined}
                      shattered={destroyingIndex === i}
                      shatterTriggerId={destroyEventId}
                      onShatterComplete={() => {
                        if (i === destroyingIndex) {
                          setDestroyingIndex(null);
                          setIsLocked(false);
                          // Remove any coins associated with this vase once destruction completes
                          setCoinsByVase(prev => prev.map((arr, idx) => (idx === i ? [] : arr)));
                          // Allow this vase to be destroyed again in the future
                          destroyingVasesRef.current.delete(i);
                        }
                      }}
                    />
                    {/* Invisible inner colliders approximating the vase walls/base */}
                    <CuboidCollider args={[0.05, 1.2, 0.8]} position={[0.85, 1.2, 0]} />
                    <CuboidCollider args={[0.05, 1.2, 0.8]} position={[-0.85, 1.2, 0]} />
                    <CuboidCollider args={[0.8, 1.2, 0.05]} position={[0, 1.2, 0.85]} />
                    <CuboidCollider args={[0.8, 1.2, 0.05]} position={[0, 1.2, -0.85]} />
                    <CuboidCollider args={[0.8, 0.05, 0.8]} position={[0, 0.15, 0]} />
                    {/* Wider pedestal to catch missed coins */}
                    <CuboidCollider args={[2.5, 0.1, 2.5]} position={[0, 0, 0]} />
                  </RigidBody>
                  {titles3D[i] && (
                    <FloatingTitle3D
                      title={titles3D[i]}
                      color={baseColors[i]}
                    />
                  )}
                  {/* Render coins for this vase using the simple Coin API */}
                  {coinsByVase[i].map((coin) => (
                    <Coin key={coin.id} r={1.5} h={0.24} pos={coin.position} rot={coin.rotation} />
                  ))}
                </VaseShatterContext.Provider>
              </group>
            );
          })}
        </Suspense>
        {/* Global catch floor far below the grid to diagnose falling bodies */}
        <RigidBody type="fixed">
          <CuboidCollider args={[1000, 0.5, 1000]} position={[0, -200, 0]} />
        </RigidBody>
        </Physics>
        {/* Title screen 3D text (rendered far away so both scenes coexist) */}
        {(appMode === 'title' || isConnecting) && (
          <FloatingTitle3D
            title={isConnecting ? 'CONNECTING...' : 'activity tracker'}
            position={[TITLE_TARGET.x, TITLE_TARGET.y, TITLE_TARGET.z]}
            size={3.6}
            color="#333333"
          />
        )}
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
            maxDistance={28}
            onChange={handleControlsChange}
            target={appMode === 'title' ? [TITLE_TARGET.x, TITLE_TARGET.y, TITLE_TARGET.z] : [defaultTarget.current.x, defaultTarget.current.y, defaultTarget.current.z]}
          />

          <CameraResetAnimator
            controlsRef={controlsRef}
            resetRef={resetRef}
            onDone={() => {
              setIsResetting(false);
              setDraggingMode(null);
              if (onResetDoneOnceRef.current) {
                const fn = onResetDoneOnceRef.current;
                onResetDoneOnceRef.current = null;
                fn();
              }
            }}
          />
        </Canvas>
      </div>
      {/* Title screen overlay UI */}
      {appMode === 'title' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none', // pass-through except for button
          }}
        >
          <button
            onClick={() => {
              if (isConnecting) return;
              setIsConnecting(true);
              // After 3-5s, start smooth camera move to vases, then swap UI mode on completion
              const delay = 3000 + Math.random() * 2000;
              connectTimerRef.current = setTimeout(() => {
                onResetDoneOnceRef.current = () => {
                  setAppMode('vases');
                  setIsConnecting(false);
                };
                startTitleToVasesTransition();
              }, delay);
            }}
            disabled={isConnecting}
            style={{
              pointerEvents: 'auto',
              position: 'absolute',
              transform: 'translateY(30vh)', // slightly below vertical center
              padding: '14px 28px',
              fontSize: 16,
              borderRadius: 9999,
              border: '1px solid #111',
              background: isConnecting ? '#ddd' : '#fff',
              color: '#111',
              cursor: isConnecting ? 'default' : 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
            }}
          >
            {isConnecting ? 'CONNECTING…' : 'Connect'}
          </button>
        </div>
      )}
      {/* Lock overlay to disable all interactions during destroy */}
      {isLocked && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0)',
            pointerEvents: 'auto',
          }}
        />
      )}
    </div>
  );
}