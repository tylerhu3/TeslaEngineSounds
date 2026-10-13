import React, { useRef, useEffect } from 'react';
import {
  createSceneController,
  createLane,
  updateCanvasEngineState
} from '../engine/sceneCanvasEngine';
import { MotionRainController } from '../engine/rainPhysicsEngine';

const NIGHT_SCENES = [
  'warp',
  'road',
  'plaid',
  'space',
  'desert',
  'japan',
  'route66',
  'route66-halloween',
  'italia',
  'autobahn',
  'miami'
];

const FONT_MAP = {
  warp: 'sceneStage--isFontWarp',
  rain: 'sceneStage--isFontRain',
  road: 'sceneStage--isFontRoad',
  desert: 'sceneStage--isFontDesert',
  plaid: 'sceneStage--isFontPlaid',
  snow: 'sceneStage--isFontSnow',
  space: 'sceneStage--isFontSpace',
  japan: 'sceneStage--isFontJapan',
  route66: 'sceneStage--isFontRoute66',
  italia: 'sceneStage--isFontItalia',
  miami: 'sceneStage--isFontItalia',
  autobahn: 'sceneStage--isFontRoad',
  'route66-halloween': 'sceneStage--isFontRoute66'
};

export default function CanvasStage({
  scene,
  speedKmh,
  acceleration,
  throttle = 0,
  shiftProgress = 0,
  shiftWay = 1,
  tremorAmount = 0.5,
  rainActive = false
}) {
  const mainCanvasRef = useRef(null);
  const laneCanvasRef = useRef(null);
  const rainCanvasRef = useRef(null);

  const sceneKey = scene?.scene || 'route66';
  const accent = scene?.accent || '#f7b733';
  const isRain = sceneKey === 'rain';
  const showRain = isRain && rainActive;

  // Storing freshest motion values in ref to avoid recreating RAF loop on every frame
  const motionRef = useRef({ speedKmh: 0, acceleration: 0, throttle: 0 });
  useEffect(() => {
    motionRef.current = { speedKmh, acceleration, throttle };
  }, [speedKmh, acceleration, throttle]);

  // Compute tremor
  const tremorNorm = Math.min(Math.max((speedKmh - 100) / 90, 0), 1) * 2.8 * tremorAmount;
  const isTremor = tremorNorm >= 0.3;
  const isNight = NIGHT_SCENES.includes(sceneKey);
  const fontClass = FONT_MAP[sceneKey] || 'sceneStage--isFontRoute66';

  // Always keep state synced in engine
  useEffect(() => {
    updateCanvasEngineState({
      speedKmh,
      acceleration,
      shiftProgress,
      shiftWay,
      roadReveal: 1,
      introTravel: 0,
      isDark: true
    });
  }, [speedKmh, acceleration, shiftProgress, shiftWay]);

  useEffect(() => {
    let animId = null;
    let mainCtrl = null;
    let laneCtrl = null;
    let rainCtrl = null;
    let ro = null;

    try {
      if (isRain) {
        const laneEl = laneCanvasRef.current;
        if (laneEl) {
          laneCtrl = createLane({ value: laneEl }, () => accent);
          laneCtrl.resize();
        }
      } else {
        const mainEl = mainCanvasRef.current;
        if (mainEl) {
          mainCtrl = createSceneController(sceneKey, mainEl, () => accent);
          mainCtrl.resize();
        }
      }

      if (showRain && rainCanvasRef.current) {
        rainCtrl = new MotionRainController(rainCanvasRef.current);
        rainCtrl.resize();
      }
    } catch (err) {
      console.error('Failed to init scene controller:', err);
    }

    const handleResize = () => {
      try {
        if (laneCtrl) laneCtrl.resize();
        if (mainCtrl) mainCtrl.resize();
        if (rainCtrl) rainCtrl.resize();
      } catch {}
    };

    const observedEl = isRain ? laneCanvasRef.current : mainCanvasRef.current;
    if (window.ResizeObserver && observedEl) {
      ro = new ResizeObserver(handleResize);
      ro.observe(observedEl);
    }
    window.addEventListener('resize', handleResize);

    // Render loop
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      try {
        if (laneCtrl) {
          laneCtrl.draw(dt);
        }
        if (mainCtrl) {
          mainCtrl.draw(dt);
        }
        if (rainCtrl && showRain) {
          rainCtrl.updateMotionState(
            motionRef.current.speedKmh,
            motionRef.current.acceleration,
            motionRef.current.throttle
          );
          rainCtrl.draw(dt);
        }
      } catch (err) {
        console.error('Error in canvas draw loop:', err);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (ro) ro.disconnect();
      if (rainCtrl) rainCtrl.destroy();
      window.removeEventListener('resize', handleResize);
    };
  }, [sceneKey, accent, isRain, showRain]);

  return (
    <div
      className={`sceneStage ${fontClass} ${isNight ? 'sceneStage--isNight' : ''} ${isTremor ? 'sceneStage--isTremoring' : ''}`}
      style={{
        '--reveal-scene': '1',
        '--reveal-hud': '1',
        '--tremor': tremorNorm.toFixed(1)
      }}
    >
      <div className="sceneStage__scenery">
        <div className="sceneCanvas">
          {isRain ? (
            <canvas ref={laneCanvasRef} className="sceneCanvas__layer lane" />
          ) : (
            <canvas ref={mainCanvasRef} className={`sceneCanvas__layer ${sceneKey}`} />
          )}
          {showRain && (
            <canvas
              ref={rainCanvasRef}
              className="sceneCanvas__layer rainOverlay"
              style={{ pointerEvents: 'none', zIndex: 1 }}
            />
          )}
        </div>
      </div>
      <span className={`sceneStage__vignette ${sceneKey === 'plaid' ? 'sceneStage__vignette--isFaded' : ''}`} />
    </div>
  );
}
