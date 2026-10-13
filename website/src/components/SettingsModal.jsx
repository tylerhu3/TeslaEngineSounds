import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X, Sun, Moon, AlertTriangle, Compass, ShieldCheck } from 'lucide-react';
import { LOCALES, TRANSLATIONS } from '../data/translations';

// 1. Sleek Dribe Drag/Click Slider Bar
function TheSettingsSlider({ label, value, onChange, disabled = false }) {
  const barRef = useRef(null);
  const [isSliding, setIsSliding] = useState(false);

  const calculateRatio = useCallback((clientX) => {
    if (!barRef.current) return value;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio;
  }, [value]);

  const handlePointerDown = (e) => {
    if (disabled) return;
    setIsSliding(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(calculateRatio(e.clientX));
  };

  const handlePointerMove = (e) => {
    if (!isSliding || disabled) return;
    onChange(calculateRatio(e.clientX));
  };

  const handlePointerUp = (e) => {
    if (isSliding) {
      setIsSliding(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    const step = 0.05;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(1, value + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(0, value - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(1);
    }
  };

  const percent = Math.round(value * 100);

  return (
    <div className={`settingsSlider ${disabled ? 'settingsSlider--isOff' : ''} ${isSliding ? 'settingsSlider--isSliding' : ''}`}>
      <div className="settingsSlider__head">
        <span className="settingsSlider__label">{label}</span>
        <span className="settingsSlider__value">{percent}%</span>
      </div>
      <div
        ref={barRef}
        className="settingsSlider__bar"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <span
          className="settingsSlider__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// 2. Dribe Pill Switch Toggle
function TheSettingsSwitch({ label, isOn, onChange }) {
  return (
    <label className="settingsSwitch">
      <span className="settingsSwitch__label">{label}</span>
      <span className={`settingsSwitch__track ${isOn ? 'settingsSwitch__track--isOn' : ''}`}>
        <input
          type="checkbox"
          className="settingsSwitch__checkbox"
          checked={isOn}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settingsSwitch__knob" />
      </span>
    </label>
  );
}

// 3. Dribe Multi-slot Segmented Pill Toggle
function TheSettingsToggle({ options, value, onSelect }) {
  const activeIndex = Math.max(0, options.findIndex((opt) => opt.value === value));
  const slotsCount = options.length;

  const pillStyle = {
    '--slots': slotsCount,
    '--active': activeIndex,
    width: `calc((100% - var(--switch-pad) * 2 - var(--switch-gap) * ${slotsCount - 1}) / ${slotsCount})`,
    transform: `translateX(calc((100% + var(--switch-gap)) * ${activeIndex}))`
  };

  return (
    <span className="settingsToggle">
      {options.map((opt) => {
        const isOn = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`settingsToggle__slot ${isOn ? 'settingsToggle__slot--isOn' : ''}`}
            aria-pressed={isOn}
            aria-label={opt.label}
            onClick={() => onSelect(opt.value)}
          >
            {opt.icon ? opt.icon : opt.label}
          </button>
        );
      })}
      <span className="settingsToggle__pill" style={pillStyle} />
    </span>
  );
}

// 4. Background Audio Section with Animated Warning
function TheSettingsAudio({
  isBackgroundAudio,
  onChangeBackgroundAudio,
  t
}) {
  return (
    <div className="settingsAudio">
      <TheSettingsSwitch
        label={t.backgroundAudio}
        isOn={isBackgroundAudio}
        onChange={onChangeBackgroundAudio}
      />
      <p className="settingsAudio__hint">{t.backgroundAudioHint}</p>

      {/* Animated warning displayed when background audio is off */}
      {!isBackgroundAudio && (
        <div className="settingsAudio__fold">
          <p className="settingsAudio__warning">
            <AlertTriangle className="settingsAudio__icon" size={15} />
            <span>{t.backgroundAudioWarning}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// 5. Main Settings Modal Dialog
export default function SettingsModal({
  isOpen,
  onClose,
  // Localization
  locale = 'en',
  onSetLocale,
  // Volumes
  effectsVolume = 0.85,
  onChangeEffectsVolume,
  musicVolume = 0.7,
  onChangeMusicVolume,
  hasSelectedMusic = false,
  isBackgroundAudio = true,
  onChangeBackgroundAudio,
  // Appearance
  themePreference = 'dark', // 'auto' | 'light' | 'dark'
  onSetThemePreference,
  isReadoutHidden = false,
  onChangeReadoutHidden,
  wheelSide = 'left',
  onChangeWheelSide,
  // Speed Unit
  unit = 'mph',
  onSetUnit,
  // Cockpit & Tesla Additions
  tremorAmount = 0.5,
  onSetTremor,
  isGpsActive = false,
  onToggleGps
}) {
  if (!isOpen) return null;

  const t = (TRANSLATIONS[locale] || TRANSLATIONS.en).settings;

  const themeOptions = [
    { value: 'light', label: t.themeLight, icon: <Sun size={13} /> },
    { value: 'dark', label: t.themeDark, icon: <Moon size={13} /> }
  ];

  const wheelOptions = [
    { value: 'left', label: t.sideLeft },
    { value: 'right', label: t.sideRight }
  ];

  const unitOptions = [
    { value: 'km/h', label: 'km/h' },
    { value: 'mph', label: 'mph' }
  ];

  const tremorOptions = [
    { value: 0, label: t.tremorOff },
    { value: 0.5, label: t.tremorSubtle },
    { value: 1.0, label: t.tremorRealistic }
  ];

  const isThemeAuto = themePreference === 'auto';

  return (
    <div className="settings" role="presentation">
      {/* Background Scrim */}
      <button
        type="button"
        className="settings__scrim"
        aria-label={t.close}
        onClick={onClose}
      />

      {/* Main Panel */}
      <div className="settings__panel" role="dialog" aria-label={t.title}>
        {/* Header */}
        <div className="settings__head">
          <h2 className="settings__title">{t.title}</h2>
          <button
            type="button"
            className="settings__close"
            aria-label={t.close}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* 1. Volumes Section */}
        <section className="settings__group">
          <h3 className="settings__legend">{t.volumes}</h3>

          <TheSettingsSlider
            label={t.effects}
            value={effectsVolume}
            onChange={onChangeEffectsVolume}
          />

          {hasSelectedMusic && (
            <TheSettingsSlider
              label={t.music}
              value={musicVolume}
              onChange={onChangeMusicVolume}
            />
          )}

          <TheSettingsAudio
            isBackgroundAudio={isBackgroundAudio}
            onChangeBackgroundAudio={onChangeBackgroundAudio}
            t={t}
          />
        </section>

        {/* 2. Appearance Section */}
        <section className="settings__group">
          <h3 className="settings__legend">{t.appearance}</h3>

          {/* Theme Row with Auto button and Light/Dark segmented toggle */}
          <div className="settings__row">
            <span className="settings__label">{t.theme}</span>
            <div className="settings__choices">
              <button
                type="button"
                className={`settings__choice ${isThemeAuto ? 'settings__choice--isOn' : ''}`}
                aria-pressed={isThemeAuto}
                onClick={() => onSetThemePreference('auto')}
              >
                {t.themeAuto}
              </button>
              <TheSettingsToggle
                options={themeOptions}
                value={themePreference === 'auto' ? 'dark' : themePreference}
                onSelect={(val) => onSetThemePreference(val)}
              />
            </div>
          </div>

          {/* Hide the speedometer Switch */}
          <TheSettingsSwitch
            label={t.hideReadout}
            isOn={isReadoutHidden}
            onChange={onChangeReadoutHidden}
          />

          {/* Steering wheel position */}
          <div className="settings__row">
            <span className="settings__label">{t.wheelSide}</span>
            <TheSettingsToggle
              options={wheelOptions}
              value={wheelSide}
              onSelect={onChangeWheelSide}
            />
          </div>
        </section>

        {/* 3. Account & Preferences Section (Sign on & feedback omitted per instructions) */}
        <section className="settings__group">
          <h3 className="settings__legend">{t.language}</h3>

          {/* Language Select Dropdown */}
          <label className="settings__row" style={{ cursor: 'pointer' }}>
            <span className="settings__label">{t.language}</span>
            <select
              className="settings__select"
              value={locale}
              onChange={(e) => onSetLocale(e.target.value)}
              aria-label={t.language}
            >
              {LOCALES.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.label}
                </option>
              ))}
            </select>
          </label>

          {/* Speed Unit Toggle */}
          <div className="settings__row">
            <span className="settings__label">{t.unit}</span>
            <TheSettingsToggle
              options={unitOptions}
              value={unit}
              onSelect={onSetUnit}
            />
          </div>
        </section>

        {/* 4. Tesla & Cockpit Advanced Integration Section */}
        <section className="settings__group">
          <h3 className="settings__legend">{t.vehicle}</h3>

          {/* Cockpit Tremor / G-Force Shake */}
          <div className="settings__row">
            <span className="settings__label">{t.tremor}</span>
            <TheSettingsToggle
              options={tremorOptions}
              value={tremorAmount}
              onSelect={onSetTremor}
            />
          </div>

          {/* GPS Speedometer Sync */}
          <div className="settings__row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="settings__label">{t.gpsSync}</span>
              <span style={{ fontSize: 11, color: 'var(--chalk-300)' }}>{t.gpsDesc}</span>
            </div>
            <TheSettingsSwitch
              label=""
              isOn={isGpsActive}
              onChange={onToggleGps}
            />
          </div>
        </section>

        {/* 5. Cockpit Controls Reference */}
        <section className="settings__group">
          <h3 className="settings__legend">{t.controls}</h3>
          <div className="shortcutsList">
            <div className="shortcutItem">
              <kbd className="keyBadge">Space</kbd>
              <span className="shortcutDesc">Throttle acceleration</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">E</kbd> / <kbd className="keyBadge">↑</kbd>
              <span className="shortcutDesc">Shift Up (Manual mode)</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">Q</kbd> / <kbd className="keyBadge">↓</kbd>
              <span className="shortcutDesc">Shift Down (Manual mode)</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">G</kbd>
              <span className="shortcutDesc">Toggle Gearbox (Auto / Manual)</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">D</kbd>
              <span className="shortcutDesc">Toggle Scenes Dock</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">U</kbd>
              <span className="shortcutDesc">Toggle Speed Units (km/h vs mph)</span>
            </div>
            <div className="shortcutItem">
              <kbd className="keyBadge">M</kbd>
              <span className="shortcutDesc">Mute / Unmute Audio</span>
            </div>
          </div>
        </section>

        {/* Footer Legal Link */}
        <a
          href="https://dribe.app/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="settings__legal"
        >
          {t.terms}
        </a>
      </div>
    </div>
  );
}
