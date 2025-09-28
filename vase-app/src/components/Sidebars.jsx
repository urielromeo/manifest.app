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
  setTextureSources,
  setActiveBaseLayer,
  setBaseColor,
  setTitle3D,
  activeAction,
  setActiveAction,
}, bottomBarRef) {
  const commonPanels = (
    <>
      <BaseColorSetter
        onBaseCanvas={(c) => setTextureSources(p => ({ ...p, base: c }))}
        clearOthers={() => setActiveBaseLayer('base')}
        onBaseColor={setBaseColor}
      />
      <Uploader
        onUploadCanvas={(c) => setTextureSources(p => ({ ...p, upload: c }))}
        clearOthers={() => setActiveBaseLayer('upload')}
      />
      <CameraCapture
        onCameraCanvas={(c) => setTextureSources(p => ({ ...p, camera: c }))}
        clearOthers={() => setActiveBaseLayer('camera')}
      />
      <VaseTextSetter onTextCanvas={(c) => setTextureSources(p => ({ ...p, text: c }))} />
      <TitleSetter onSetTitle={setTitle3D} />
      <ActionsPanel
        activeAction={activeAction}
        setActiveAction={setActiveAction}
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
        }}
        className="mobile-bottom-bar"
      >
        {commonPanels}
      </div>
    </>
  );
});

export default Sidebars;
