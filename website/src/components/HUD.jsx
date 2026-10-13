import React from 'react';
import { Lock } from 'lucide-react';
import { TRANSLATIONS } from '../data/translations';

export default function HUD({
  state,
  scene,
  unit,
  onToggleUnit,
  onToggleManual,
  onShiftUp,
  onShiftDown,
  isReadoutHidden = false,
  isBackgroundAudio = true,
  locale = 'en'
}) {
  const {
    speedKmh,
    speedMph,
    rpm,
    redlineRpm,
    idleRpm,
    gear,
    maxGears,
    isManual,
    isShifting,
    isShiftReady,
    throttle,
    accelerationMs2
  } = state;

  const t = (TRANSLATIONS[locale] || TRANSLATIONS.en).hud;

  const displaySpeed = Math.round(unit === 'mph' ? speedMph : speedKmh);
  const normRpm = Math.max(0, Math.min(1, (rpm - idleRpm) / (redlineRpm - idleRpm)));

  const gaugeMark = 82; // 82%
  const gaugeFill = (normRpm * 100).toFixed(2);
  const gaugeRedline = Math.max(0, Math.min(normRpm * 100 - gaugeMark, 100 - gaugeMark)).toFixed(2);

  const intensity = Math.min(Math.max(speedKmh / 115, 0), 1);
  const speedScale = (1 - 0.6 * intensity).toFixed(3);
  const unitScale = ((1 - 0.28 * intensity) / (1 - 0.6 * intensity)).toFixed(3);

  const hasGearbox = maxGears > 1;

  const handleGearboxClick = () => {
    if (!isBackgroundAudio) {
      // Manual gearbox is locked when background audio is off
      return;
    }
    onToggleManual();
  };

  return (
    <>
      {/* 1. Top-Center Gearbox Switch */}
      {hasGearbox && (
        <span className="stageMode">
          <button
            type="button"
            className={`stageMode__switch ${isManual ? 'stageMode__switch--isManual' : ''} ${!isBackgroundAudio ? 'stageMode__switch--locked' : ''}`}
            aria-pressed={isManual}
            aria-label="Mode"
            onClick={handleGearboxClick}
            title={!isBackgroundAudio ? t.manualLocked : undefined}
          >
            <span className="stageMode__slot stageMode__slot--isAuto">AUTO</span>
            <span className="stageMode__slot stageMode__slot--isManual">
              {!isBackgroundAudio && <Lock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
              MANUAL
            </span>
            <span className="stageMode__pill" />
          </button>
          <span className="stageMode__caption">
            {!isBackgroundAudio ? t.manualLocked : t.gearbox}
          </span>
        </span>
      )}

      {/* 2. Center Speed Readout (smoothly hidden when isReadoutHidden is true) */}
      <div
        className={`sceneStage__hud ${isReadoutHidden ? 'sceneStage__hud--hidden' : ''}`}
        style={{
          transition: 'opacity 0.28s var(--ease-out), transform 0.28s var(--ease-out)',
          opacity: isReadoutHidden ? 0 : 1,
          pointerEvents: isReadoutHidden ? 'none' : 'auto',
          transform: isReadoutHidden ? 'scale(0.95)' : 'scale(1)'
        }}
      >
        <div className={`readout ${isShiftReady ? 'readout--isShiftReady' : ''} ${hasGearbox ? 'readout--isGeared' : ''}`}>
          <p
            className="readout__speed"
            style={{
              '--speed-scale': speedScale,
              '--unit-scale': unitScale
            }}
          >
            <span className="readout__value">{displaySpeed}</span>
            <span
              className="readout__unit"
              onClick={onToggleUnit}
              title="Click to switch km/h and mph"
              style={{ cursor: 'pointer' }}
            >
              {unit.toUpperCase()}
            </span>
          </p>

          {/* Manual Gear indicator */}
          {hasGearbox && (
            <p className="readout__gear">
              <span className="readout__gearRow">
                {isManual && (
                  <button
                    type="button"
                    className="readout__paddle readout__paddle--down"
                    onClick={onShiftDown}
                    title="Shift Down (Q or Down Arrow)"
                    disabled={gear <= 1}
                  >
                    −
                  </button>
                )}

                <span className="readout__gearSlot">
                  <span className={`readout__gearValue ${isShifting ? 'readout__gearValue--shifting' : ''}`}>
                    {gear}
                  </span>
                </span>

                <span className="readout__gearArrow" aria-hidden="true">
                  <svg viewBox="0 0 12 16" role="presentation">
                    <path d="M6 15.2V2.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                    <path d="M1.5 6.4 6 1.6l4.5 4.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>

                {isManual && (
                  <button
                    type="button"
                    className="readout__paddle readout__paddle--up"
                    onClick={onShiftUp}
                    title="Shift Up (E or Up Arrow)"
                    disabled={gear >= maxGears}
                  >
                    +
                  </button>
                )}
              </span>
              <span className="readout__gearKey">{t.gear}</span>
            </p>
          )}
        </div>
      </div>

      {/* 3. Bottom Tachometer Gauge Bar */}
      <div
        className={`gauge ${isShiftReady ? 'gauge--isShiftReady' : ''}`}
        style={{
          '--gauge-mark': `${gaugeMark}%`,
          '--gauge-fill': `${gaugeFill}%`,
          '--gauge-redline': `${gaugeRedline}%`,
          '--accent': scene.accent
        }}
      >
        <div className="gauge__bar">
          <span className="gauge__redline" />
          <span className="gauge__fill" />
          <span className="gauge__redlineFill" />
        </div>
        <dl className="gauge__stats">
          <div className="gauge__stat gauge__stat--isStart">
            <dt className="gauge__key">{t.load}</dt>
            <dd className="gauge__figure">{Math.round(throttle * 100)} %</dd>
          </div>
          <div className="gauge__stat gauge__stat--isCentre">
            <dt className="gauge__key">{t.revs}</dt>
            <dd className="gauge__figure">{Math.round(rpm).toLocaleString()} RPM</dd>
          </div>
          <div className="gauge__stat gauge__stat--isEnd">
            <dt className="gauge__key">{t.acceleration}</dt>
            <dd className="gauge__figure">{accelerationMs2.toFixed(1)} m/s²</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
