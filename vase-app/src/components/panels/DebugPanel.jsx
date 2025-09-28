// DebugPanel: provides a checkbox to toggle vase rotation on drag.
// Props:
//  - rotateVase: boolean
//  - setRotateVase(boolean)

export default function DebugPanel({ rotateVase, setRotateVase }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Debug</div>
      <label style={{ color: "white", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={rotateVase}
          onChange={(e) => setRotateVase(e.target.checked)}
        />
        Drag rotates vase (camera locked)
      </label>
    </div>
  );
}