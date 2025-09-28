import React, { useState } from "react";

// VaseTextSetter: lets user set text to be drawn on a 1024x1024 canvas.
// Props:
//  - onTextCanvas(canvas)

export default function VaseTextSetter({ onTextCanvas }) {
  const [text, setText] = useState("");

  const applyText = () => {
    const SIZE = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    // transparent background by default
    ctx.clearRect(0, 0, SIZE, SIZE);
    const clean = (text || "").slice(0, 18);
    if (clean.length > 0) {
      let fontSize = 200;
      const maxWidth = SIZE * 0.85;
      while (fontSize > 12) {
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const w = ctx.measureText(clean).width;
        if (w <= maxWidth) break;
        fontSize -= 4;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111";
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-SIZE, 0);
      ctx.fillText(clean, SIZE / 2, SIZE / 2);
      ctx.restore();
    }
    onTextCanvas(canvas);
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Vase text</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => e.target.value.length <= 18 && setText(e.target.value)}
          maxLength={18}
          placeholder="max 18 characters"
          style={{ flex: 1, padding: "6px 8px", borderRadius: 0, border: "none" }}
        />
        <button onClick={applyText} style={{ padding: "6px 10px", borderRadius: 0, border: "none", cursor: "pointer" }}>Set</button>
      </div>
    </div>
  );
}
