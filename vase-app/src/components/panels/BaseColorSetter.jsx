import React, { useState } from "react";

// BaseColorSetter: lets user choose a base color and paints a 1024x1024 canvas.
// Props:
//  - onBaseCanvas(canvas)
//  - clearOthers() : to clear other texture sources
export default function BaseColorSetter({ onBaseCanvas, clearOthers, onBaseColor }) {
  const [color, setColor] = useState("#ffffff");

  const handleSetColor = () => {
    const SIZE = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);
    clearOthers();
    onBaseCanvas(canvas);
    if (onBaseColor) onBaseColor(color);
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Set base color</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 40, height: 30, border: "none", borderRadius: 0 }}
        />
        <button onClick={handleSetColor} style={{ padding: "6px 10px", borderRadius: 0, border: "none", cursor: "pointer" }}>
          SET
        </button>
      </div>
    </div>
  );
}
