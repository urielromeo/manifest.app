import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Bounds } from "@react-three/drei";
import VaseModel, { MODEL_URL } from "./components/VaseModel.jsx";
import FloatingTitle3D from "./components/FloatingTitle3D.jsx";
import Sidebars from './components/Sidebars.jsx';
import useComposedTexture from './hooks/useComposedTexture.js';

const BOUNDS_MARGIN = 2.15;

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

    if (t >= 1) {
      resetRef.current = null;
      onDone();
    }
  });
  return null;
}

export default function App() {
  // Unified texture sources (preparing for multi-vase extensibility)
  const [textureSources, setTextureSources] = useState({
    base: null,
    upload: null,
    camera: null,
    text: null, // overlay layer (never the primary base layer)
  });
  const [activeBaseLayer, setActiveBaseLayer] = useState('base'); // 'base' | 'upload' | 'camera'
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [title3D, setTitle3D] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  // Mobile layout adjustment
  const bottomBarRef = useRef(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  // Interaction state
  const [draggingMode, setDraggingMode] = useState(null); // 'vase' | 'camera' | null
  const [isResetting, setIsResetting] = useState(false);
  // Track if a vase pointer down has occurred this tick to avoid canvas race
  const vasePointerActiveRef = useRef(false);

  const controlsRef = useRef(null);

  // Defaults & reset helpers
  const defaultCamPos = useRef(new THREE.Vector3(0, 1, 6));
  const defaultTarget = useRef(new THREE.Vector3(0, 0, 0));
  const defaultDir = useRef(
    defaultCamPos.current.clone().sub(defaultTarget.current).normalize()
  );
  const resetRef = useRef(null);

  const startCameraReset = useCallback(() => {
    if (!controlsRef.current) return;
    const dist = controlsRef.current.getDistance();
    const toPos = defaultTarget.current
      .clone()
      .add(defaultDir.current.clone().multiplyScalar(dist));
    resetRef.current = {
      fromPos: controlsRef.current.object.position.clone(),
      toPos,
      fromTarget: controlsRef.current.target.clone(),
      toTarget: defaultTarget.current.clone(),
      elapsed: 0,
      duration: 1,
    };
    setIsResetting(true);
  }, []);

  // Map active base layer into priority slots expected by hook (camera > upload > base)
  const baseParam = activeBaseLayer === 'base' ? textureSources.base : null;
  const uploadParam = activeBaseLayer === 'upload' ? textureSources.upload : null;
  const cameraParam = activeBaseLayer === 'camera' ? textureSources.camera : null;

  const { texture } = useComposedTexture({
    base: baseParam,
    upload: uploadParam,
    camera: cameraParam,
    text: textureSources.text,
    fallbackColor: '#f8f8f8',
    size: 1024,
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
    if (vasePointerActiveRef.current) return; // vase consumed this event
    if (draggingMode === "vase" || isResetting) return;
    if (draggingMode === null) setDraggingMode("camera");
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
      vasePointerActiveRef.current = false; // reset flag after pointer cycle
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [draggingMode, startCameraReset]);

  const handleVasePointerDown = useCallback((e) => {
    // Prevent the canvas onPointerDown from firing in the same tick
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isResetting) return;
    vasePointerActiveRef.current = true;
    setDraggingMode("vase");
  }, [isResetting]);

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
        setTextureSources={setTextureSources}
        setActiveBaseLayer={setActiveBaseLayer}
        setBaseColor={setBaseColor}
        setTitle3D={setTitle3D}
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
        current zoom: {currentZoom.toFixed(2)} | mode: {draggingMode || "idle"}
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
          <Bounds fit clip margin={BOUNDS_MARGIN}>
            <VaseModel
              texture={texture || defaultTexture}
              rotateWithPointer={true}
              onVasePointerDown={handleVasePointerDown}
            />
          </Bounds>
        </Suspense>
        <FloatingTitle3D title={title3D} color={baseColor} />
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