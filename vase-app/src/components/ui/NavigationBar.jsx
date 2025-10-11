import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import UIButton from './UIButton.jsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function NavigationBar({
  isLocked,
  isResetting,
  activeVaseIndex,
  baseColor,
  onPrev,
  onNext,
  onStartHoldPrev,
  onStartHoldNext,
  onStopHold,
  onSetOverlayText,
  onSet3DTitle,
  onOpenColorPicker,
  onResetCamera,
  onManifest,
  onDestroy,
  onColorPicked,
  colorInputRef,
  barRef,
  // New: camera capture handlers
  onCameraCanvas,
  onCameraSetActive,
  // New: upload handlers
  onUploadCanvas,
  onUploadSetActive,
  // New: background (skybox) handlers
  hasSkybox,
  onSkyboxSelected, // receives a data URL string
  onClearSkybox,
  // If true, keep destroy button enabled even while locked (to allow re-trigger)
  allowDestroyWhileLocked = false,
}) {
  // --- Camera capture state ---
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Hidden file input for upload
  const uploadInputRef = useRef(null);
  // Hidden file input for background image
  const bgInputRef = useRef(null);

  // Try to detect if device has multiple cameras
  useEffect(() => {
    let cancelled = false;
    if (navigator?.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        if (cancelled) return;
        const count = devices.filter((d) => d.kind === 'videoinput').length;
        setHasMultipleCameras(count > 1);
      }).catch(() => {/* noop */});
    }
    return () => { cancelled = true; };
  }, []);

  const attachAndPlay = async () => {
    // wait for next tick to ensure <video> exists
    await new Promise((r) => setTimeout(r, 50));
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = streamRef.current;
    const play = async () => {
      try { await v.play(); } catch { /* ignore */ }
    };
    if (v.readyState >= 2) play(); else v.onloadedmetadata = play;
  };

  const startCamera = async (mode = facingMode) => {
    try {
      // Tear down any previous stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(mode);
      setCameraOpen(true);
      await attachAndPlay();
    } catch (err) {
      console.error('[NavigationBar] getUserMedia failed:', err);
      alert('Could not access your camera. Check permissions.');
      stopCamera();
    }
  };

  const stopCamera = () => {
    try {
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const v = videoRef.current;
      if (v) {
        try { v.pause(); } catch { /* noop */ }
        v.srcObject = null;
      }
    } finally {
      setCameraOpen(false);
    }
  };

  useEffect(() => () => stopCamera(), []);

  const flipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    await startCamera(next);
  };

  const onSnap = () => {
    if (!cameraOpen) return;
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // Mirror horizontally for a selfie-like capture
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Inform parent: set active layer and provide canvas
    onCameraSetActive && onCameraSetActive();
    onCameraCanvas && onCameraCanvas(canvas);
    stopCamera();
  };

  // --- Upload handling (cover-fit to 1024x1024 like Uploader.jsx) ---
  const handleOpenUpload = () => {
    if (isLocked || isResetting) return;
    uploadInputRef.current?.click();
  };

  const handleUploadChange = async (e) => {
    const file = e.target.files?.[0];
    // Clear value so selecting the same file later still triggers change
    e.target.value = '';
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const SIZE = 1024;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          // cover fit
          const iw = img.width, ih = img.height;
          const scale = Math.max(SIZE / iw, SIZE / ih);
          const dw = iw * scale, dh = ih * scale;
          const dx = (SIZE - dw) / 2;
          const dy = (SIZE - dh) / 2;
          ctx.clearRect(0, 0, SIZE, SIZE);
          ctx.drawImage(img, dx, dy, dw, dh);
          // Inform parent
          onUploadSetActive && onUploadSetActive();
          onUploadCanvas && onUploadCanvas(canvas);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        alert('Failed to load image. Please try a different file.');
      };
      img.src = objectUrl;
    } catch (err) {
      console.error('[NavigationBar] Upload failed:', err);
      try { URL.revokeObjectURL(objectUrl); } catch {}
      alert('Failed to load image as texture. See console for details.');
    }
  };

  // --- Background (skybox) handling ---
  const handleBackgroundClick = () => {
    if (isLocked || isResetting) return;
    if (hasSkybox) {
      onClearSkybox && onClearSkybox();
    } else {
      bgInputRef.current?.click();
    }
  };

  const handleBackgroundChange = (e) => {
    const file = e.target.files?.[0];
    // Allow re-choosing same file later
    e.target.value = '';
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl === 'string') {
          onSkyboxSelected && onSkyboxSelected(dataUrl);
        }
      };
      reader.onerror = () => {
        alert('Failed to read image file.');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[NavigationBar] Background upload failed:', err);
      alert('Failed to load background image. See console for details.');
    }
  };

  return (
    <div
      ref={barRef}
      style={{
        width: '100%',
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1201,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        pointerEvents: 'auto',
      }}
    >
      {/* Row 1: navigation + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <UIButton
          hoverScale={1}
          tapScale={1}
          onClick={onPrev}
          onPointerDown={(e) => {
            e.preventDefault();
            onStartHoldPrev();
          }}
          onPointerUp={onStopHold}
          onPointerLeave={onStopHold}
          onPointerCancel={onStopHold}
          disabled={isLocked || isResetting}
          style={{ width: 48 }}
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </UIButton>
        <UIButton
          hoverScale={1}
          tapScale={1}
          onClick={onNext}
          onPointerDown={(e) => {
            e.preventDefault();
            onStartHoldNext();
          }}
          onPointerUp={onStopHold}
          onPointerLeave={onStopHold}
          onPointerCancel={onStopHold}
          disabled={isLocked || isResetting}
          style={{ width: 48 }}
        >
          <ArrowRight size={20} strokeWidth={2} />
        </UIButton>
        <div style={{ width: 1, height: 28, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />

        <UIButton animated onClick={onManifest} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          manifest
        </UIButton>
        <UIButton
          animated
          onClick={onDestroy}
          disabled={(isLocked && !allowDestroyWhileLocked) || isResetting}
          style={{ fontSize: 14 }}
        >
          destroy
        </UIButton>

      </div>

      {/* Row 2: vase controls + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <UIButton animated onClick={onSetOverlayText} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          vase text
        </UIButton>
        <UIButton animated onClick={onOpenColorPicker} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          vase color
        </UIButton>
        <UIButton animated onClick={onSet3DTitle} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          3d text
        </UIButton>
        {/* New: Upload button */}
        <UIButton
          animated
          onClick={handleOpenUpload}
          disabled={isLocked || isResetting}
          style={{ fontSize: 14 }}
        >
          upload
        </UIButton>
        {/* Existing: Camera button */}
        <UIButton
          animated
          onClick={() => startCamera('user')}
          disabled={isLocked || isResetting || cameraOpen}
          style={{ fontSize: 14 }}
        >
          photo
        </UIButton>
        {/* New: Background toggle button */}
        <UIButton
          animated
          onClick={handleBackgroundClick}
          disabled={isLocked || isResetting}
          style={{ fontSize: 14 }}
          title={hasSkybox ? 'remove background' : 'set background'}
        >
          background
        </UIButton>
      </div>

      {/* Hidden color input */}
      <input
        ref={colorInputRef}
        type="color"
        defaultValue={baseColor || '#ffffff'}
        onChange={onColorPicked}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      {/* Hidden upload input */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      {/* Hidden background input */}
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        onChange={handleBackgroundChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />

      {/* Camera overlay */}
      {cameraOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            WebkitBackdropFilter: 'blur(2px)',
            backdropFilter: 'blur(2px)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 'min(80vw, 80vh)',
                height: 'min(80vw, 80vh)',
                background: 'black',
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
            >
              <video
                ref={videoRef}
                muted
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <UIButton animated onClick={onSnap} style={{ fontSize: 14 }}>SNAP</UIButton>
              {hasMultipleCameras && (
                <UIButton animated onClick={flipCamera} style={{ fontSize: 14 }}>flip</UIButton>
              )}
              <UIButton animated onClick={stopCamera} style={{ fontSize: 14 }}>cancel</UIButton>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
