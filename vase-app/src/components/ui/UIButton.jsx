import React from 'react';
import { motion } from 'motion/react';

/**
 * A minimal, reactive button with smooth tap/hover scaling using Motion.
 * Visuals: black border, white background, black text (even when disabled).
 * Tweaks applied:
 *  - Cursor shows `not-allowed` when disabled
 *  - Accessible focus ring via :focus-visible emulation (keyboard-only)
 *  - Forward ref support for programmatic focus/measurement
 */
const UIButton = React.forwardRef(function UIButton(
  {
    children,
    style,
    className,
    disabled,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onFocus,
    onBlur,
    animated = false,
    hoverScale = 1.03,
    tapScale = 1.08,
    ...rest
  },
  ref
) {
  // Track if the current interaction originated from a pointer (mouse/touch/pen).
  const usingPointerRef = React.useRef(false);

  // Emulate :focus-visible so keyboard users get a clear ring without forcing it for pointer users.
  const [isFocusVisible, setIsFocusVisible] = React.useState(false);
  const [isHoverCapable, setIsHoverCapable] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover)');
    const update = () => setIsHoverCapable(!!mq.matches);
    update();
    try {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    } catch (_) {
      // Safari < 14 fallback
      mq.addListener?.(update);
      return () => mq.removeListener?.(update);
    }
  }, []);

  const hasPointerHandlers = !!(onPointerDown || onPointerUp || onPointerLeave || onPointerCancel);

  const handlePointerDown = (e) => {
    if (disabled) return;
    usingPointerRef.current = true;
    onPointerDown?.(e);
  };

  const clearUsingPointerSoon = () => {
    setTimeout(() => {
      usingPointerRef.current = false;
    }, 0);
  };

  const handlePointerUp = (e) => {
    if (disabled) return;
    onPointerUp?.(e);
    clearUsingPointerSoon();
  };

  const handlePointerLeave = (e) => {
    if (disabled) return;
    onPointerLeave?.(e);
    clearUsingPointerSoon();
  };

  const handlePointerCancel = (e) => {
    if (disabled) return;
    onPointerCancel?.(e);
    clearUsingPointerSoon();
  };

  const handleClick = (e) => {
    if (disabled) return;
    if (hasPointerHandlers && usingPointerRef.current) {
      e.preventDefault();
      e.stopPropagation();
      usingPointerRef.current = false;
      return;
    }
    onClick?.(e);
  };

  const handleFocus = (e) => {
    // If focus did not come from a pointer, show the ring (keyboard nav).
    if (!usingPointerRef.current) {
      setIsFocusVisible(true);
    }
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocusVisible(false);
    onBlur?.(e);
  };

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding: '10px 14px',
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #000',
    background: '#fff',
    color: '#000',
    cursor: disabled ? (isHoverCapable ? 'not-allowed' : 'auto') : (isHoverCapable ? 'pointer' : 'auto'),
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    // Focus ring (keyboard only)
    outline: isFocusVisible ? '2px solid #000' : 'none',
    outlineOffset: isFocusVisible ? 2 : 0,
    ...style,
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      className={className}
      disabled={disabled}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onFocus={handleFocus}
      onBlur={handleBlur}
      whileHover={animated && isHoverCapable && !disabled ? { scale: hoverScale } : undefined}
      whileTap={animated && !disabled ? { scale: tapScale } : undefined}
      transition={animated ? { type: 'spring', stiffness: 520, damping: 26, bounce: 0.35 } : undefined}
      style={baseStyle}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export default UIButton;
