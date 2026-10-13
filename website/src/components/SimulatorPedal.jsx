import React, { useState, useEffect, useRef } from 'react';

export default function SimulatorPedal({
  throttle,
  onThrottleChange,
  scene,
  disabled = false
}) {
  const [isPressed, setIsPressed] = useState(false);
  const pedalRef = useRef(null);

  // Keyboard shortcut listener: Space or Shift + Space or Arrow Up
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (e.repeat) return;
        setIsPressed(true);
        onThrottleChange(1.0);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'Shift') {
        setIsPressed(false);
        onThrottleChange(0.0);
      }
    };

    const handleBlur = () => {
      setIsPressed(false);
      onThrottleChange(0.0);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [onThrottleChange]);

  const handlePointerDown = (e) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
    setIsPressed(true);
    onThrottleChange(1.0);
  };

  const handlePointerUp = (e) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}
    setIsPressed(false);
    onThrottleChange(0.0);
  };

  return (
    <div className="simulatorPedalWrap">
      <button
        ref={pedalRef}
        type="button"
        className={`simulator__pedal ${isPressed ? 'simulator__pedal--pressed' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        disabled={disabled}
        aria-pressed={isPressed}
        style={{
          '--pedal-fill': `${Math.round(throttle * 100)}%`,
          '--accent': scene.accent
        }}
      >
        <span className="simulator__pedalFill" />
        <div className="simulator__pedalContent">
          <span className="simulator__pedalTitle">Throttle</span>
          <span className="simulator__pedalHold">Press and hold</span>
          <span className="simulator__pedalKey">Space or Shift + Space</span>
        </div>
      </button>
    </div>
  );
}
