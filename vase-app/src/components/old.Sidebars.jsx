import React from 'react';
import BaseColorSetter from "./panels/BaseColorSetter.jsx";
import Uploader from "./panels/Uploader.jsx";
import CameraCapture from "./panels/CameraCapture.jsx";
import VaseTextSetter from "./panels/VaseTextSetter.jsx";
import TitleSetter from "./panels/TitleSetter.jsx";
import ActionsPanel from "./panels/ActionsPanel.jsx";
import DebugPanel from "./panels/DebugPanel.jsx";

/**
 * Sidebars component
 * Renders:
 *  - Desktop sidebar (left)
 *  - Mobile bottom bar (hidden via CSS until mobile breakpoint)
 * Forwards ref to the mobile bottom bar container so parent can measure height.
 */
const Sidebars = React.forwardRef(function Sidebars({
  activeVaseIndex,
  titles3D,
  setTextureSourcesForVase,
  setActiveBaseLayerForVase,
  setBaseColorForVase,
  setTitle3DForVase,
  activeAction,
  setActiveAction,
  disabled = false,
}, bottomBarRef) {
  const commonPanels = (
    <>
      <div style={{ color: 'white', fontSize: 12, opacity: 0.8 }}>Active Vase: #{activeVaseIndex}</div>
      <BaseColorSetter
        onBaseCanvas={(c) => setTextureSourcesForVase(activeVaseIndex, s => ({ ...s, base: c }))}
        clearOthers={() => setActiveBaseLayerForVase(activeVaseIndex, 'base')}
        onBaseColor={(col) => setBaseColorForVase(activeVaseIndex, col)}
      />
      <Uploader
        onUploadCanvas={(c) => setTextureSourcesForVase(activeVaseIndex, s => ({ ...s, upload: c }))}
        clearOthers={() => setActiveBaseLayerForVase(activeVaseIndex, 'upload')}
      />
      <CameraCapture
        onCameraCanvas={(c) => setTextureSourcesForVase(activeVaseIndex, s => ({ ...s, camera: c }))}
        clearOthers={() => setActiveBaseLayerForVase(activeVaseIndex, 'camera')}
      />
      <VaseTextSetter onTextCanvas={(c) => setTextureSourcesForVase(activeVaseIndex, s => ({ ...s, text: c }))} />
      <TitleSetter
        initialTitle={titles3D[activeVaseIndex]}
        onSetTitle={(title) => setTitle3DForVase(activeVaseIndex, title)}
      />
      <ActionsPanel
        activeAction={activeAction}
        setActiveAction={setActiveAction}
        disabled={disabled}
      />
      <DebugPanel rotateVase={true} setRotateVase={() => {}} />
    </>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 280,
          height: "100%",
          overflowY: "auto",
          opacity: disabled ? 0.5 : 1,
          filter: disabled ? 'grayscale(25%)' : 'none',
        }}
        className="desktop-sidebar"
      >
        {commonPanels}
      </div>

      <div
        ref={bottomBarRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "none",
          flexDirection: "column",
          gap: 12,
          padding: 12,
          backgroundColor: "rgba(0,0,0,0.8)",
          maxHeight: "25svh",
          overflowY: "auto",
          opacity: disabled ? 0.5 : 1,
          filter: disabled ? 'grayscale(25%)' : 'none',
        }}
        className="mobile-bottom-bar"
      >
        {commonPanels}
      </div>
    </>
  );
});

export default Sidebars;
