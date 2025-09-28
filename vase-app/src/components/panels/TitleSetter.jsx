import React, { useState } from "react";

// TileSetter: lets user set a 3D title below the vase.
// Props:
// - onSetTitle(title)

export default function TitleSetter({ onSetTitle }) {
  const [title, setTitle] = useState("");

  const applyTitle = () => {
    const clean = (title || "").slice(0, 32);
    onSetTitle(clean);
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Title</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={title}
          onChange={(e) => e.target.value.length <= 32 && setTitle(e.target.value)}
          maxLength={32}
          placeholder="3D title below the vase"
          style={{ flex: 1, padding: "6px 8px", borderRadius: 0, border: "none" }}
        />
        <button onClick={applyTitle} style={{ padding: "6px 10px", borderRadius: 0, border: "none", cursor: "pointer" }}>Set</button>
      </div>
    </div>
  );
}