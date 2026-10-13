import React from 'react';
import { Volume2, VolumeX, Settings, LayoutGrid, Disc, Compass } from 'lucide-react';
import { TRANSLATIONS } from '../data/translations';

export default function Header({
  theme,
  isMuted,
  onToggleMute,
  unit = 'mph',
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


    </header>
  );
}
