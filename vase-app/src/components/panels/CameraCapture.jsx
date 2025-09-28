import React, { useRef, useState, useEffect } from "react";

// CameraCapture: lets user take a photo with their device camera and paints a 1024x1024 canvas.
// Props:
//  - onCameraCanvas(canvas)
//  - clearOthers() : to clear other texture sources

export default function CameraCapture({ onCameraCanvas, clearOthers }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const containerSize = 256; // square preview size

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      streamRef.current = stream;
      setActive(true); // set active after we have the stream
      
      // Wait for next tick to ensure video element is rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready and then play
        const v = videoRef.current;
        const playVideo = async () => {
          try {
            await v.play();
            console.log("[CameraCapture] Video playing, dimensions:", v.videoWidth, "x", v.videoHeight);
          } catch (playErr) {
            console.error("[CameraCapture] Play failed:", playErr);
          }
        };
        
        if (v.readyState >= 2) {
          playVideo();
        } else {
          v.onloadedmetadata = playVideo;
        }
      }
    } catch (err) {
      console.error("[CameraCapture] getUserMedia failed:", err);
      alert("Could not access your camera. Check permissions.");
      setActive(false);
    }
  };

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
      videoRef.current.srcObject = null;
    }
    setActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      try { videoRef.current.play(); } catch {}
    }
  }, [active]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !active) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    clearOthers();
    clearOthers();
    onCameraCanvas(canvas);
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Take photo</div>
      <div style={{
        width: containerSize,
        height: containerSize,
        background: "black",
        borderRadius: 6,
        overflow: "hidden",
      }}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: active ? "block" : "none" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {!active ? (
          <button onClick={startCamera} style={{ padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}>Take photo</button>
        ) : (
          <>
            <button onClick={snap} style={{ padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}>Snap</button>
            <button onClick={stopCamera} style={{ padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
