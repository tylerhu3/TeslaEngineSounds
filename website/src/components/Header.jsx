import React from 'react';
import { Volume2, VolumeX, Settings, LayoutGrid, Disc, Compass } from 'lucide-react';
import { TRANSLATIONS } from '../data/translations';

export default function Header({
  theme,
  isMuted,
  onToggleMute,
  unit,
  onToggleUnit,
  isGpsActive,
  onToggleGps,
  scene,
  isLofiPlayerOpen,
  onToggleLofiPlayer,
  onOpenSettings,
  isDockOpen,
  onToggleDock,
  wheelSide = 'left',
  locale = 'en'
}) {
  const t = (TRANSLATIONS[locale] || TRANSLATIONS.en).header;

  return (
    <header className={`siteHeader ${wheelSide === 'right' ? 'siteHeader--isRight' : ''}`}>
      {/* 1. Action Controls */}
      <div className="siteHeader__actions">
        {/* Soundscapes Drawer Button */}
        <button
          type="button"
          className={`headerBtn ${isDockOpen ? 'headerBtn--active' : ''}`}
          onClick={onToggleDock}
          title={t.soundscapes}
          aria-label={t.soundscapes}
        >
          <LayoutGrid size={18} />
        </button>

        {/* Cockpit Settings */}
        <button
          type="button"
          className="headerBtn"
          onClick={onOpenSettings}
          title={t.settings}
          aria-label={t.settings}
        >
          <Settings size={18} />
        </button>

        {/* Audio Mute/Unmute */}
        <button
          type="button"
          className={`headerBtn ${isMuted ? 'headerBtn--muted' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? t.unmute : t.mute}
          aria-label={isMuted ? t.unmute : t.mute}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Lo-fi Music Player Button */}
        {scene.hasMusic && (
          <button
            type="button"
            className={`headerBtn ${isLofiPlayerOpen ? 'headerBtn--active' : ''}`}
            onClick={onToggleLofiPlayer}
            title={t.lofi}
            aria-label={t.lofi}
          >
            <Disc size={18} />
          </button>
        )}

        {/* GPS Speedometer Button & Status */}
        <button
          type="button"
          className={`headerBtn ${isGpsActive ? 'headerBtn--active' : ''}`}
          onClick={onToggleGps}
          title={isGpsActive ? `${t.gps} Active (Click to switch to manual simulation)` : `Enable ${t.gps}`}
          aria-label={t.gps}
        >
          <Compass size={18} className={isGpsActive ? 'spinIcon' : ''} />
        </button>

        {/* GPS Active Badge */}
        {isGpsActive && (
          <span
            className="headerBadge headerBadge--gps"
            title={t.gps}
            onClick={onToggleGps}
            style={{ cursor: 'pointer' }}
          >
            <Compass size={13} className="spinIcon" /> GPS
          </span>
        )}
      </div>

      {/* 2. Brand Logo */}
      <div className="siteHeader__brand">
        <div className="dribeLogoLockup" title="Dribe • Automotive Soundscapes">
          <svg className="dribeLogoIcon" viewBox="0 0 100 80" fill="currentColor">
            <path
              d="M12 10 H60 C75 10 84 20 84 32 C84 42 78 48 68 50 C80 52 88 60 88 72 C88 84 76 92 60 92 H12 L28 72 H58 C66 72 72 68 72 62 C72 56 66 52 56 52 H26 L40 34 H58 C66 34 70 30 70 24 C70 18 64 16 56 16 H24 Z"
              transform="scale(0.8) translate(0, -6)"
            />
          </svg>
          <span className="dribeLogoText">DRIBE</span>
        </div>
      </div>
    </header>
  );
}
