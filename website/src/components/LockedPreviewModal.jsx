import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Play, Pause, Flame, Volume2, Gauge } from 'lucide-react';
import CanvasStage from './CanvasStage';
import { SCENES, PACKS } from '../data/scenes';
import { engineAudio } from '../engine/audioEngine';

// Authentic preview speed cycle curve (13.0s loop)
const PREVIEW_SPEED_STEPS = [
  { to: 60, seconds: 5.2, shape: 0.62 },
  { to: 90, seconds: 1.2, shape: 0.85 },
  { to: 130, seconds: 1.4, shape: 0.85 },
  { to: 0, seconds: 4.4, shape: 1.45 },
  { to: 0, seconds: 0.8, shape: 1.0 }
];

const TOTAL_CYCLE_SECONDS = PREVIEW_SPEED_STEPS.reduce((sum, s) => sum + s.seconds, 0);

function getSpeedAtTime(clock) {
  let remaining = clock % TOTAL_CYCLE_SECONDS;
  let fromSpeed = 0;

  for (const step of PREVIEW_SPEED_STEPS) {
    if (remaining <= step.seconds) {
      const progress = Math.max(0, Math.min(1, remaining / step.seconds));
      const shapedProgress = Math.pow(progress, step.shape);
      return fromSpeed + (step.to - fromSpeed) * shapedProgress;
    }
    remaining -= step.seconds;
    fromSpeed = step.to;
  }
  return 0;
}

export default function LockedPreviewModal({
  isOpen,
  onClose,
  initialScene,
  packId,
  unit = 'mph',
  onSelectScene
}) {
  // Allow scrolling through all 12 scenes sequentially with the arrows
  const allScenes = SCENES;

  // Current preview index
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeScene = allScenes[currentIndex] || initialScene || allScenes[0];
  const activePack = PACKS.find((p) => p.sceneIds.includes(activeScene.id)) || PACKS[0];

  // Simulation mode: auto cycle or manual pedal
  const [isManualPedal, setIsManualPedal] = useState(false);
  const [manualThrottle, setManualThrottle] = useState(0);

  // Live speed and telemetry state
  const [telemetry, setTelemetry] = useState({
    speedKmh: 0,
    rpm: 800,
    gear: 1,
    loadPct: 0,
    acceleration: 0,
    throttle: 0
  });

  const animFrameRef = useRef(null);
  const clockRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const speedRef = useRef(0);
  const effortRef = useRef(0);

  // Set initial scene index when modal opens
  useEffect(() => {
    if (isOpen && initialScene) {
      const idx = allScenes.findIndex((s) => s.id === initialScene.id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
      clockRef.current = 0;
      speedRef.current = 0;
      effortRef.current = 0;
    }
  }, [isOpen, initialScene?.id]);

  // Audio start & switch when active scene changes
  useEffect(() => {
    if (!isOpen || !activeScene) return;

    // Reset speed loop on scene switch
    clockRef.current = 0;
    speedRef.current = 0;
    effortRef.current = 0;

    engineAudio.resume();
    engineAudio.start(activeScene.voiceId);

    return () => {};
  }, [isOpen, activeScene?.id, activeScene?.voiceId]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : allScenes.length - 1));
  }, [allScenes.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < allScenes.length - 1 ? prev + 1 : 0));
  }, [allScenes.length]);

  // Keyboard navigation (arrows and escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // 60FPS Speed and Audio Feedback Loop
  useEffect(() => {
    if (!isOpen) return;

    lastTimeRef.current = performance.now();

    const loop = (time) => {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      let targetSpeed = 0;
      let throttleVal = 0;
      let currentAccel = 0;

      if (isManualPedal) {
        // Manual simulation
        throttleVal = manualThrottle;
        const targetSpeedManual = manualThrottle * (activeScene.specs.topSpeedKmh || 300);
        speedRef.current += (targetSpeedManual - speedRef.current) * Math.min(dt * 2.5, 1);
        currentAccel = (targetSpeedManual - speedRef.current) / 10;
        targetSpeed = speedRef.current;
      } else {
        // Automated speed curve (0 -> 60 -> 90 -> 130 -> 0 km/h)
        clockRef.current = (clockRef.current + dt) % TOTAL_CYCLE_SECONDS;
        targetSpeed = getSpeedAtTime(clockRef.current);

        const speedDelta = targetSpeed - speedRef.current;
        currentAccel = Math.max(-14, Math.min(14, speedDelta / 3.6 / Math.max(dt, 0.001)));
        effortRef.current += (currentAccel - effortRef.current) * Math.min(dt * 6, 1);
        speedRef.current = targetSpeed;
        throttleVal = currentAccel > 0 ? Math.min(1, currentAccel / 2.5) : 0;
      }

      // Update Audio Engine with authentic vehicle physics
      engineAudio.update({
        speedKmh: targetSpeed,
        acceleration: effortRef.current,
        throttle: throttleVal,
        isThrottleDown: throttleVal > 0.1,
        customRev: isManualPedal ? (targetSpeed < 1 ? manualThrottle : null) : null
      });

      const telem = engineAudio.getTelemetry ? engineAudio.getTelemetry() : null;
      const displayRpm = telem?.rpm ?? Math.round(targetSpeed * 40 + 800);
      const displayGear = telem?.gear ?? 1;

      setTelemetry({
        speedKmh: Math.round(targetSpeed),
        rpm: displayRpm,
        gear: displayGear,
        loadPct: Math.round(throttleVal * 100),
        acceleration: effortRef.current.toFixed(1),
        throttle: throttleVal,
        isShifting: telem?.isShifting ?? false
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, activeScene, isManualPedal, manualThrottle]);

  if (!isOpen || !activeScene) return null;

  const displaySpeed = unit === 'mph' ? Math.round(telemetry.speedKmh * 0.621371) : telemetry.speedKmh;

  return (
    <div className="lockedPreviewModal">
      {/* Background Scrim */}
      <div className="lockedPreviewModal__scrim" onClick={onClose} aria-hidden="true" />

      {/* Main Dialog Container */}
      <div className="lockedPreviewModal__dialog" role="dialog" aria-modal="true" aria-label="Sound Preview">
        {/* Close Button */}
        <button
          type="button"
          className="lockedPreviewModal__close"
          onClick={onClose}
          aria-label="Close Sound Preview"
        >
          <X size={20} />
        </button>

        {/* 1. Live Interactive Scene Stage Viewport */}
        <div className="lockedPreviewModal__stage">
          <div className="lockedPreviewModal__canvasWrapper">
            <CanvasStage
              scene={activeScene}
              speedKmh={telemetry.speedKmh}
              acceleration={Number(telemetry.acceleration)}
              shiftProgress={0}
              shiftWay={0}
              tremorAmount={0.3}
            />

            {/* In-Stage Cockpit HUD Readout */}
            <div className="lockedPreviewModal__hud">
              <div className="lockedPreviewModal__speedReadout">
                <span className="lockedPreviewModal__speedVal">{displaySpeed}</span>
                <span className="lockedPreviewModal__speedUnit">{unit}</span>
              </div>

              <div className="lockedPreviewModal__hudStats">
                <div className="lockedPreviewModal__statItem">
                  <span className="lockedPreviewModal__statLabel">Load</span>
                  <span className="lockedPreviewModal__statVal">{telemetry.loadPct}%</span>
                </div>
                <div className="lockedPreviewModal__statItem">
                  <span className="lockedPreviewModal__statLabel">RPM</span>
                  <span className="lockedPreviewModal__statVal">{telemetry.rpm.toLocaleString()}</span>
                </div>
                <div className="lockedPreviewModal__statItem">
                  <span className="lockedPreviewModal__statLabel">Accel</span>
                  <span className="lockedPreviewModal__statVal">{telemetry.acceleration} m/s²</span>
                </div>
                <div className="lockedPreviewModal__statItem">
                  <span className="lockedPreviewModal__statLabel">Gear</span>
                  <span className="lockedPreviewModal__statVal">G{telemetry.gear}</span>
                </div>
              </div>
            </div>

            {/* Left Chevron Arrow Button */}
            <button
              type="button"
              className="lockedPreviewModal__arrow lockedPreviewModal__arrow--left"
              onClick={handlePrev}
              aria-label="Previous Car Sound"
              title="Previous Selection (Left Arrow)"
            >
              <ChevronLeft size={28} />
            </button>

            {/* Right Chevron Arrow Button */}
            <button
              type="button"
              className="lockedPreviewModal__arrow lockedPreviewModal__arrow--right"
              onClick={handleNext}
              aria-label="Next Car Sound"
              title="Next Selection (Right Arrow)"
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* Dots Navigation for all Selections */}
          <div className="lockedPreviewModal__dots">
            {allScenes.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`lockedPreviewModal__dot ${idx === currentIndex ? 'lockedPreviewModal__dot--active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                style={{ '--dot-accent': item.accent }}
                aria-label={`Select ${item.name}`}
                title={item.name}
              />
            ))}
          </div>
        </div>

        {/* 2. Car Details & Sound Information */}
        <div className="lockedPreviewModal__content">
          <div className="lockedPreviewModal__header">
            <div className="lockedPreviewModal__packBadge">
              <span>{activePack.name.toUpperCase()} · SCENE {currentIndex + 1} OF {allScenes.length}</span>
            </div>
            <h2 className="lockedPreviewModal__carName" style={{ color: activeScene.accent }}>
              {activeScene.name}
            </h2>
            <p className="lockedPreviewModal__tagline">{activeScene.tagline}</p>
          </div>

          {/* Specs Grid */}
          <div className="lockedPreviewModal__specsGrid">
            <div className="lockedPreviewModal__specCard">
              <span className="lockedPreviewModal__specKey">Engine Architecture</span>
              <span className="lockedPreviewModal__specVal">{activeScene.specs.engine}</span>
            </div>
            <div className="lockedPreviewModal__specCard">
              <span className="lockedPreviewModal__specKey">Acoustic Rev Limit</span>
              <span className="lockedPreviewModal__specVal">{activeScene.specs.redlineRpm.toLocaleString()} RPM</span>
            </div>
            <div className="lockedPreviewModal__specCard">
              <span className="lockedPreviewModal__specKey">Drivetrain</span>
              <span className="lockedPreviewModal__specVal">{activeScene.specs.gears} Gears (Dog-Ring Shifts)</span>
            </div>
            <div className="lockedPreviewModal__specCard">
              <span className="lockedPreviewModal__specKey">Sound Model</span>
              <span className="lockedPreviewModal__specVal" style={{ color: '#00f2fe' }}>
                <Volume2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Real Dual-Crossfade WAV Layers
              </span>
            </div>
          </div>

          {/* Interactive Simulation Throttle Bar */}
          <div className="lockedPreviewModal__simBar">
            <div className="lockedPreviewModal__simStatus">
              <Flame size={16} color={activeScene.accent} />
              <span>
                {isManualPedal
                  ? 'Manual Pedal Mode: Hold Throttle Below'
                  : 'Automated Speed Loop (0 → 130 km/h) Simulating Acceleration & Shifts'}
              </span>
            </div>

            <div className="lockedPreviewModal__simActions">
              <button
                type="button"
                className={`lockedPreviewModal__toggleBtn ${isManualPedal ? 'lockedPreviewModal__toggleBtn--active' : ''}`}
                onClick={() => {
                  setIsManualPedal((prev) => !prev);
                  setManualThrottle(0);
                }}
              >
                {isManualPedal ? 'Switch to Auto Cycle' : 'Interactive Pedal'}
              </button>

              {isManualPedal && (
                <button
                  type="button"
                  className="lockedPreviewModal__pedalBtn"
                  onPointerDown={() => setManualThrottle(1)}
                  onPointerUp={() => setManualThrottle(0)}
                  onPointerCancel={() => setManualThrottle(0)}
                >
                  Hold Throttle Pedal
                </button>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="lockedPreviewModal__footer">
            <div className="lockedPreviewModal__footerInfo">
              <span className="lockedPreviewModal__footerTitle">All 12 Soundscapes Unlocked</span>
              <span className="lockedPreviewModal__footerHint">Select this car to drive it on the cockpit stage</span>
            </div>

            <button
              type="button"
              className="lockedPreviewModal__unlockBtn"
              style={{ '--btn-accent': activeScene.accent }}
              onClick={() => {
                if (onSelectScene) onSelectScene(activeScene);
                onClose();
              }}
            >
              <Gauge size={17} />
              <span>Drive {activeScene.name}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
