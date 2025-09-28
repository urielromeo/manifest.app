import React, { useState, useEffect } from "react";

// Uploader: lets user upload an image file and paints a 1024x1024 canvas.
// Props:
//  - onUploadCanvas(canvas)
//  - clearOthers() : to clear other texture sources

export default function Uploader({ onUploadCanvas, clearOthers }) {
  const [url, setUrl] = useState(null);

  // Cleanup object URLs when they change/unmount
  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);

    console.debug("[Uploader] Loading texture from object URL:", objectUrl, file);
    try {
      const img = new Image();
      img.onload = () => {
        const SIZE = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        // cover fit
        const iw = img.width, ih = img.height;
        const scale = Math.max(SIZE / iw, SIZE / ih);
        const dw = iw * scale, dh = ih * scale;
        const dx = (SIZE - dw) / 2;
        const dy = (SIZE - dh) / 2;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, dx, dy, dw, dh);
        clearOthers();
        clearOthers();
        onUploadCanvas(canvas);
      };
      img.src = objectUrl;
    } catch (err) {
      console.error("[Uploader] Texture load failed:", err);
      alert("Failed to load image as texture. See console for details.");
    }
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <label style={{ color: "white", fontSize: 14 }}>
        Upload texture
        <input type="file" accept="image/*" onChange={handleChange} style={{ display: "block", marginTop: 6 }} />
      </label>
    </div>
  );
}