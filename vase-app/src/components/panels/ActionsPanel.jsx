import React from "react";
// ActionsPanel: provides MANIFEST and DESTROY buttons.
// Props:
//  - activeAction: 'manifest' | 'destroy' | null
//  - setActiveAction(action) : to set the active action

export default function ActionsPanel({ activeAction, setActiveAction, disabled = false }) {
  const handleManifest = () => {
    if (disabled) return;
    setActiveAction(activeAction === 'manifest' ? null : 'manifest');
  };

  const handleDestroy = () => {
    if (disabled) return;
    setActiveAction(activeAction === 'destroy' ? null : 'destroy');
  };

  return (
    <div style={{ background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 }}>
      <div style={{ color: "white", fontSize: 14, marginBottom: 6 }}>Actions</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button 
          onClick={handleManifest}
          style={{ 
            padding: "6px 12px", 
            borderRadius: 4, 
            border: "none", 
            cursor: disabled ? "not-allowed" : "pointer",
            backgroundColor: activeAction === 'manifest' ? "#4CAF50" : "#f0f0f0",
            color: activeAction === 'manifest' ? "white" : "black",
            fontWeight: activeAction === 'manifest' ? "bold" : "normal",
            opacity: disabled ? 0.6 : 1,
          }}
          disabled={disabled}
        >
          MANIFEST
        </button>
        <button 
          onClick={handleDestroy}
          style={{ 
            padding: "6px 12px", 
            borderRadius: 4, 
            border: "none", 
            cursor: disabled ? "not-allowed" : "pointer",
            backgroundColor: activeAction === 'destroy' ? "#f44336" : "#f0f0f0",
            color: activeAction === 'destroy' ? "white" : "black",
            fontWeight: activeAction === 'destroy' ? "bold" : "normal",
            opacity: disabled ? 0.6 : 1,
          }}
          disabled={disabled}
        >
          DESTROY
        </button>
      </div>
    </div>
  );
}