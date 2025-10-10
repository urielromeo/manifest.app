import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback, useContext } from "react";
import "./App.css";
import { VASE_COUNT, VASE_COLUMNS_COUNT, VASE_SPACING, VASE_TARGET_Y, INITIAL_CAMERA_DISTANCE, CAMERA_HEIGHT, INITIAL_CAMERA_Z } from './config/constants.js';
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
import { loadOrInitVases, mapVasesToUiState, updateVaseAt } from './services/vases.js';
import UIButton from './components/ui/UIButton.jsx';
import NavigationBar from './components/ui/NavigationBar.jsx';
import { getVaseTarget } from "./utils/layout.js";
import { formatTimeAgo } from "./utils/time.js";
import { createSolidColorCanvas, createTextOverlayCanvas } from "./utils/canvas.js";
import CameraResetAnimator from './components/camera/CameraResetAnimator.jsx';
import useVaseDesignState from './hooks/useVaseDesignState.js';
import useCoinsByVase from './hooks/useCoinsByVase.js';

export const VaseShatterContext = React.createContext({ phase: 'idle', center: [0,0,0], trigger: 0 });

const BOUNDS_MARGIN = 2.15; // (kept for potential future use)

// Title scene camera/target (kept far away so both scenes render simultaneously)
const TITLE_TARGET = new THREE.Vector3(0, 4, -100);
const TITLE_CAMERA_POS = new THREE.Vector3(0, 7, -92);

// --- Helper component for camera reset animation ---
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3); // hoisted to avoid re-allocation each frame

// NavigationBar extracted to component

export default function App() {
  const isTest1 = typeof window !== 'undefined' && window.location.pathname === '/test-1';
  if (isTest1) return <Test1Page />;
  // App mode: title screen vs vases
  const [appMode, setAppMode] = useState('title'); // 'title' | 'vases'
  const [isConnecting, setIsConnecting] = useState(false);
  const connectTimerRef = useRef(null);
  // Optional hook to run custom logic after a camera reset/transition completes
  const onResetDoneOnceRef = useRef(null);
  // Per-vase design state via hook
  const {
    textureSourcesList,
    activeBaseLayers,
    baseColors,
    titles3D,
    setTextureSourcesForVase,
    setActiveBaseLayerForVase,
    setBaseColorForVase,
    setTitle3DForVase,
    setTextureSourcesList,
    setActiveBaseLayers,
    setBaseColors,
    setTitles3D,
  } = useVaseDesignState();
  // In-memory vases loaded from storage (no autosave yet)
  const [vases, setVases] = useState([]);
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
  // Coins per vase via hook
  const { coinsByVase, spawnCoinForVase, setCoinsByVase, clearCoinsForVase } = useCoinsByVase();
  // Stats modal state
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  // spawnCoinForVase provided by useCoinsByVase
  // Debug: toggle Rapier collider wireframes
  const [debugPhysics, setDebugPhysics] = useState(false);
  // Mobile layout adjustment
  const bottomBarRef = useRef(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  // Interaction state
  const [draggingMode, setDraggingMode] = useState(null); // 'vase' | 'camera' | null
  const [isResetting, setIsResetting] = useState(false);
  const [needsCameraReset, setNeedsCameraReset] = useState(false);

  // Camera reset tolerances (squared distances)
  const RESET_POS_EPS_SQ = 0.05 * 0.05;    // ~5 cm positional tolerance
  const RESET_TARGET_EPS_SQ = 0.025 * 0.025; // tighter target tolerance
  // Zoom intent gating: allow zoom only when actively rotating (dragging camera) or while 'Z' is held
  const [zoomKeyDown, setZoomKeyDown] = useState(false);
  const containerRef = useRef(null);

  const controlsRef = useRef(null);
  // Hold-to-repeat navigation support
  const holdTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const activeVaseIndexRef = useRef(0);
  useEffect(() => { activeVaseIndexRef.current = activeVaseIndex; }, [activeVaseIndex]);

  const stopHoldNav = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

   
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


  const startHoldNav = useCallback((dir) => {
    if (isLocked || isResetting || appMode !== 'vases') return;
    // Immediate step on press
    focusVase(activeVaseIndexRef.current + dir);
    // After a short delay, start repeating
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        if (isLocked || isResetting || appMode !== 'vases') return;
        focusVase(activeVaseIndexRef.current + dir);
      }, 140);
    }, 320);
  }, [focusVase, isLocked, isResetting, appMode]);

  // Stop any hold if state changes or on unmount
  useEffect(() => stopHoldNav(), [isLocked, isResetting, appMode, stopHoldNav]);
  useEffect(() => () => stopHoldNav(), [stopHoldNav]);

  // Load or initialize vases from storage on first mount; populate UI state only (no autosave yet)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const vases = await loadOrInitVases();
      if (!mounted) return;
      setVases(vases);
      const mapped = mapVasesToUiState(vases);
      // Initialize design state from storage mapping
      setTextureSourcesList(mapped.textureSourcesList);
      setActiveBaseLayers(mapped.activeBaseLayers);
      setBaseColors(mapped.baseColors);
      setTitles3D(mapped.titles3D);
    })();
    return () => { mounted = false; };
  }, []);

  // One-time title size to fit viewport (non-reactive)
  const [titleSize, setTitleSize] = useState(1);
  useEffect(() => {
    // Use the smaller viewport dimension so it fits on both portrait/landscape
    // The 0.008 factor is empirically chosen to look good with current camera
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const size = Math.min(vw, vh) * 0.0008;
    setTitleSize(size);
    // Intentionally no resize listener: compute once only
  }, []);

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
  // setter helpers provided by useVaseDesignState

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

        const controls = controlsRef.current;
        const cam = controls.object;
        const distance = controls.getDistance();
        setCurrentZoom(distance);

        // Desired pose = default target + default direction * current distance
        const desiredPos = defaultTarget.current
          .clone()
          .add(defaultDir.current.clone().multiplyScalar(distance));

        const posDiffSq = cam.position.distanceToSquared(desiredPos);
        const targetDiffSq = controls.target.distanceToSquared(defaultTarget.current);

        // Show the button only if we exceed tolerances and we're actually in the vases mode
        const shouldShow =
          appMode === 'vases' &&
          (posDiffSq > RESET_POS_EPS_SQ || targetDiffSq > RESET_TARGET_EPS_SQ);

        setNeedsCameraReset(shouldShow);
      });
    };
  }, [appMode]);

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


  // Global pointerup to finalize drags
  useEffect(() => {
    const up = () => {
      if (isLocked || appMode !== 'vases') return;
      if (draggingMode === "camera") {
        // Camera was moved; let the tolerance logic decide visibility
        setDraggingMode(null);
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

  // Hold 'Z' to allow zoom even when not dragging
  useEffect(() => {
    const onDown = (e) => { if (e.key === 'z' || e.key === 'Z') setZoomKeyDown(true); };
    const onUp = (e) => { if (e.key === 'z' || e.key === 'Z') setZoomKeyDown(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // Keep OrbitControls mounted & active so first pointer move rotates immediately.
  // We dynamically enable/disable rotate & pan based on draggingMode to avoid
  // missing the initial pointerdown event when we previously relied on props.
  useEffect(() => {
    if (!controlsRef.current) return;
    // Allow camera interaction whenever not locked/resetting (both title and vases screens).
    const baseAllow = !isResetting && !isLocked;

    // Keep OrbitControls ready to accept a drag at pointerdown time. Disable entirely only while dragging the vase.
    controlsRef.current.enabled = baseAllow && draggingMode !== 'vase';

    // Leave rotate/pan always true so the pointerdown can initiate a drag.
    controlsRef.current.enableRotate = true;
    controlsRef.current.enablePan = true;

    // Zoom intent: allow when not dragging a vase (background/camera), or when 'Z' is held.
    const allowZoom = baseAllow && (draggingMode !== 'vase' || zoomKeyDown);
    controlsRef.current.enableZoom = allowZoom;
  }, [draggingMode, isResetting, isLocked, appMode, zoomKeyDown]);

  // Wheel-guard to block accidental zoom when zoom is not explicitly allowed
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      // If the wheel event occurs over our canvas container and zoom is not explicitly allowed, prevent it.
      const baseAllow = !isResetting && !isLocked;
      const allowZoom = baseAllow && (draggingMode !== 'vase' || zoomKeyDown);
      if (!allowZoom && el.contains(e.target)) {
        // e.preventDefault(); // disabled because it's too disruptive on desktop
      }
    };
    // Use capture phase and non-passive to be able to preventDefault
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [appMode, isResetting, isLocked, draggingMode, zoomKeyDown]);

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

  // Quick actions: overlay text, 3D title, base color
  const colorInputRef = useRef(null);

  const handleSetOverlayText = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    const input = window.prompt('Enter overlay text for this vase (leave empty to clear):', '');
    if (input === null) return; // canceled
    const s = input.trim();
    if (!s) {
      setTextureSourcesForVase(activeVaseIndex, (prev) => ({ ...prev, text: null }));
      return;
    }
    const canvas = createTextOverlayCanvas(s, 1024);
    if (canvas) setTextureSourcesForVase(activeVaseIndex, (prev) => ({ ...prev, text: canvas }));
  }, [appMode, isLocked, isResetting, activeVaseIndex, setTextureSourcesForVase, createTextOverlayCanvas]);

  const handleSet3DTitle = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    const current = titles3D[activeVaseIndex] || '';
    const input = window.prompt('Enter 3D title text (leave empty to clear):', current);
    if (input === null) return; // canceled
    const s = input.trim();
    setTitle3DForVase(activeVaseIndex, s);
  }, [appMode, isLocked, isResetting, activeVaseIndex, titles3D, setTitle3DForVase]);

  const handleOpenColorPicker = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    colorInputRef.current?.click();
  }, [appMode, isLocked, isResetting]);

  const handleColorPicked = useCallback((e) => {
    const val = e?.target?.value;
    if (!val) return;
    const idx = activeVaseIndex;
    setBaseColorForVase(idx, val);
    // Also set the vase base texture to this solid color and select 'base' layer
    const canvas = createSolidColorCanvas(val, 1024);
    if (canvas) setTextureSourcesForVase(idx, (prev) => ({ ...prev, base: canvas }));
    setActiveBaseLayerForVase(idx, 'base');
  }, [activeVaseIndex, setBaseColorForVase, setTextureSourcesForVase, setActiveBaseLayerForVase, createSolidColorCanvas]);

  // Stats modal callbacks
  const handleOpenStatsModal = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    setIsStatsModalOpen(true);
  }, [appMode, isLocked, isResetting]);

  const handleCloseStatsModal = useCallback(() => {
    setIsStatsModalOpen(false);
  }, []);

  const handleResetVase = useCallback(async () => {
    if (appMode !== 'vases') return;
    const ok = window.confirm("are you sure? you'll lose all progress on this vase");
    if (!ok) return;
    const idx = activeVaseIndex;
    try {
      // Reset DB fields for this vase
      const updated = await updateVaseAt(vases, idx, {
        name: '',
        stats: { destroyCount: 0, coinAmount: 0 },
        // Also reset creation time so it appears as newly created
        createdAt: new Date().toISOString(),
      });
      setVases(updated);
      // Reset local UI state for this vase
      setTitles3D(prev => prev.map((t, i) => (i === idx ? '' : t)));
      setBaseColors(prev => prev.map((c, i) => (i === idx ? '#ffffff' : c)));
      const white = createSolidColorCanvas('#ffffff', 1024);
      if (white) setTextureSourcesForVase(idx, (prev) => ({ ...prev, base: white, upload: null, camera: null, text: null }));
      setActiveBaseLayerForVase(idx, 'base');
      setCoinsByVase(prev => prev.map((arr, i) => (i === idx ? [] : arr)));
    } finally {
      setIsStatsModalOpen(false);
    }
  }, [appMode, activeVaseIndex, vases, setTextureSourcesForVase, setActiveBaseLayerForVase, setBaseColors, setTitles3D, setCoinsByVase, createSolidColorCanvas]);

  // New quick action handlers
  const handleResetCamera = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    startCameraReset();
  }, [appMode, isLocked, isResetting, startCameraReset]);

  const handleTriggerManifest = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    setActiveAction('manifest');
    const idx = activeVaseIndex;
    // Optimistically update local state using functional setState to avoid stale reads on rapid clicks
    setVases((prev) => {
      const next = prev.map((v, i) => {
        if (i !== idx) return v;
        const currentCount = v?.stats?.coinAmount ?? 0;
        return {
          ...v,
          stats: {
            ...v.stats,
            coinAmount: currentCount + 1,
          },
        };
      });
      // Persist in the background using the freshly computed state
      (async () => {
        try {
          const newCount = next[idx]?.stats?.coinAmount ?? 0;
          await updateVaseAt(next, idx, { stats: { coinAmount: newCount } });
        } catch (e) {
          console.error('Failed to persist coinAmount:', e);
        }
      })();
      return next;
    });
  }, [appMode, isLocked, isResetting, activeVaseIndex]);

  const handleTriggerDestroy = useCallback(() => {
    if (appMode !== 'vases' || isLocked || isResetting) return;
    setActiveAction('destroy');
  }, [appMode, isLocked, isResetting]);

  return (
    <div ref={containerRef} style={{ width: "100vw", height: "100svh", overflow: "hidden" }}>
      {/* Top-center info bar showing creation time for the active vase (vases mode only) */}
      {appMode === 'vases' && vases[activeVaseIndex] && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 12,
            background: 'rgba(0,0,0,0.55)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            pointerEvents: 'auto',
            textAlign: 'center',
          }}
        >
          {/* Row 1: vase name or placeholder; click to set */}
          <div
            onClick={async (e) => {
              e.stopPropagation();
              if (isLocked || isResetting) return;
              const current = vases[activeVaseIndex]?.name || '';
              const next = window.prompt('Enter a name for this vase (leave empty to clear):', current);
              if (next === null) return; // canceled
              const name = next.trim();
              // Update local vases state and persist
              const updated = await updateVaseAt(vases, activeVaseIndex, { name });
              setVases(updated);
            }}
            style={{
              cursor: (isLocked || isResetting) ? 'default' : 'pointer',
              fontWeight: 600,
              marginBottom: 2,
              whiteSpace: 'nowrap',
            }}
            title="Click to name this vase"
          >
            {vases[activeVaseIndex]?.name?.trim() ? vases[activeVaseIndex].name : 'this vase has no name'}
          </div>
          {/* Rows 2 & 3: created + stats (clickable to open modal) */}
          <div
            onClick={(e) => { e.stopPropagation(); if (!isLocked && !isResetting) handleOpenStatsModal(); }}
            style={{ marginTop: 2, cursor: (isLocked || isResetting) ? 'default' : 'pointer' }}
            title="Click for details"
          >
            <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
              created {formatTimeAgo(vases[activeVaseIndex]?.createdAt)} ago
            </div>
            <div style={{ marginTop: 2 }}>
              <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                {(() => {
                  const n = vases[activeVaseIndex]?.stats?.destroyCount ?? 0;
                  return n > 0 ? `${n} time${n === 1 ? '' : 's'} destroyed` : 'never destroyed';
                })()}
              </div>
              <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                {(() => {
                  const m = vases[activeVaseIndex]?.stats?.coinAmount ?? 0;
                  return m > 0 ? `${m} time${m === 1 ? '' : 's'} manifested` : 'never manifested';
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      {isStatsModalOpen && (
        <div
          onClick={handleCloseStatsModal}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(92vw, 420px)',
              background: '#fff',
              color: '#111',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              {vases[activeVaseIndex]?.name?.trim() ? vases[activeVaseIndex].name : 'this vase has no name'}
            </div>
            <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
              created {formatTimeAgo(vases[activeVaseIndex]?.createdAt)} ago
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                {(() => {
                  const n = vases[activeVaseIndex]?.stats?.destroyCount ?? 0;
                  return n > 0 ? `${n} time${n === 1 ? '' : 's'} destroyed` : 'never destroyed';
                })()}
              </div>
              <div style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                {(() => {
                  const m = vases[activeVaseIndex]?.stats?.coinAmount ?? 0;
                  return m > 0 ? `${m} time${m === 1 ? '' : 's'} manifested` : 'never manifested';
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <UIButton onClick={handleCloseStatsModal} style={{ fontSize: 14 }}>close</UIButton>
              <UIButton animated onClick={handleResetVase} style={{ fontSize: 14, background: '#ffe9e9', borderColor: '#e55' }}>reset vase</UIButton>
            </div>
          </div>
        </div>
      )}
      {false && appMode === 'vases' && (
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

      {appMode === 'vases' && (
        <NavigationBar
          isLocked={isLocked}
          isResetting={isResetting}
          activeVaseIndex={activeVaseIndex}
          baseColor={baseColors[activeVaseIndex]}
          onPrev={() => focusVase(activeVaseIndex - 1)}
          onNext={() => focusVase(activeVaseIndex + 1)}
          onStartHoldPrev={() => startHoldNav(-1)}
          onStartHoldNext={() => startHoldNav(1)}
          onStopHold={stopHoldNav}
          onSetOverlayText={handleSetOverlayText}
          onSet3DTitle={handleSet3DTitle}
          onOpenColorPicker={handleOpenColorPicker}
          onResetCamera={handleResetCamera}
          onManifest={handleTriggerManifest}
          onDestroy={handleTriggerDestroy}
          onColorPicked={handleColorPicked}
          colorInputRef={colorInputRef}
          barRef={bottomBarRef}
        />
      )}

      {/* Debug Stats */}
      <div
        style={{
          display: "none",
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
                          // Increment destroyed count and persist
                          setVases((prev) => {
                            const next = prev.map((v, idx2) => {
                              if (idx2 !== i) return v;
                              const current = v?.stats?.destroyCount ?? 0;
                              return {
                                ...v,
                                stats: {
                                  ...v.stats,
                                  destroyCount: current + 1,
                                },
                              };
                            });
                            (async () => {
                              try {
                                const newCount = next[i]?.stats?.destroyCount ?? 0;
                                await updateVaseAt(next, i, { stats: { destroyCount: newCount } });
                              } catch (e) {
                                console.error('Failed to persist destroyCount:', e);
                              }
                            })();
                            return next;
                          });
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
            size={titleSize}
            thickness={0.15}
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
            maxDistance={42}
            onChange={handleControlsChange}
            onStart={() => setDraggingMode('camera')}
            target={appMode === 'title' ? [TITLE_TARGET.x, TITLE_TARGET.y, TITLE_TARGET.z] : [defaultTarget.current.x, defaultTarget.current.y, defaultTarget.current.z]}
          />

          <CameraResetAnimator
            controlsRef={controlsRef}
            resetRef={resetRef}
            onDone={() => {
              setIsResetting(false);
              setDraggingMode(null);
              setNeedsCameraReset(false);
              if (onResetDoneOnceRef.current) {
                const fn = onResetDoneOnceRef.current;
                onResetDoneOnceRef.current = null;
                fn();
              }
            }}
          />
        </Canvas>
      </div>
      {appMode === 'vases' && needsCameraReset && !isResetting && !isLocked && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 12,
            pointerEvents: 'auto',
          }}
        >
          <UIButton
            animated
            onClick={handleResetCamera}
            disabled={isLocked || isResetting}
            style={{ fontSize: 14 }}
          >
            reset camera
          </UIButton>
        </div>
      )}
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