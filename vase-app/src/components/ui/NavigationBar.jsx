import React from 'react';
import UIButton from './UIButton.jsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function NavigationBar({
  isLocked,
  isResetting,
  activeVaseIndex,
  baseColor,
  onPrev,
  onNext,
  onStartHoldPrev,
  onStartHoldNext,
  onStopHold,
  onSetOverlayText,
  onSet3DTitle,
  onOpenColorPicker,
  onResetCamera,
  onManifest,
  onDestroy,
  onColorPicked,
  colorInputRef,
  barRef,
}) {
  return (
    <div
      ref={barRef}
      style={{
        width: '100%',
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        pointerEvents: 'auto',
      }}
    >
      {/* Row 1: navigation + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <UIButton
          hoverScale={1}
          tapScale={1}
          onClick={onPrev}
          onPointerDown={(e) => {
            e.preventDefault();
            onStartHoldPrev();
          }}
          onPointerUp={onStopHold}
          onPointerLeave={onStopHold}
          onPointerCancel={onStopHold}
          disabled={isLocked || isResetting}
          style={{ width: 48 }}
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </UIButton>
        <UIButton
          hoverScale={1}
          tapScale={1}
          onClick={onNext}
          onPointerDown={(e) => {
            e.preventDefault();
            onStartHoldNext();
          }}
          onPointerUp={onStopHold}
          onPointerLeave={onStopHold}
          onPointerCancel={onStopHold}
          disabled={isLocked || isResetting}
          style={{ width: 48 }}
        >
          <ArrowRight size={20} strokeWidth={2} />
        </UIButton>
      </div>

      {/* Row 2: vase controls + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <UIButton animated onClick={onSetOverlayText} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          vase text
        </UIButton>
        <UIButton animated onClick={onOpenColorPicker} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          vase color
        </UIButton>
        <UIButton animated onClick={onSet3DTitle} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          3d text
        </UIButton>
        <div style={{ width: 1, height: 28, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
        <UIButton animated onClick={onManifest} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          manifest
        </UIButton>
        <UIButton animated onClick={onDestroy} disabled={isLocked || isResetting} style={{ fontSize: 14 }}>
          destroy
        </UIButton>
      </div>

      {/* Hidden color input */}
      <input
        ref={colorInputRef}
        type="color"
        defaultValue={baseColor || '#ffffff'}
        onChange={onColorPicked}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
    </div>
  );
}
