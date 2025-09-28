import React from "react";
// ActionsPanel: provides MANIFEST and DESTROY buttons.
// Props:
//  - activeAction: 'manifest' | 'destroy' | null
//  - setActiveAction(action) : to set the active action

export default function ActionsPanel({ activeAction, setActiveAction }) {
  const handleManifest = () => {
    setActiveAction(activeAction === 'manifest' ? null : 'manifest');
  };

  const handleDestroy = () => {
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
            cursor: "pointer",
            backgroundColor: activeAction === 'manifest' ? "#4CAF50" : "#f0f0f0",
            color: activeAction === 'manifest' ? "white" : "black",
            fontWeight: activeAction === 'manifest' ? "bold" : "normal"
          }}
        >
          MANIFEST
        </button>
        <button 
          onClick={handleDestroy}
          style={{ 
            padding: "6px 12px", 
            borderRadius: 4, 
            border: "none", 
            cursor: "pointer",
            backgroundColor: activeAction === 'destroy' ? "#f44336" : "#f0f0f0",
            color: activeAction === 'destroy' ? "white" : "black",
            fontWeight: activeAction === 'destroy' ? "bold" : "normal"
          }}
        >
          DESTROY
        </button>
      </div>
    </div>
  );
}