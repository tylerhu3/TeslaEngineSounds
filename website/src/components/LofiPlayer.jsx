import React, { useState } from 'react';
import { Play, Pause, SkipForward, CloudRain, Music } from 'lucide-react';

const LOFI_TRACKS = [
  { title: "Dusk Between Stoops", artist: "Chillhop & Cozy Beats" },
  { title: "Ashes in the Coffee Cup", artist: "Jazz Lounge & Bookstore Grooves" },
  { title: "Almost Floating", artist: "Ambient Drift & Dreamscapes" },
  { title: "3AM Sink Light", artist: "Soul & Warm Rooms" },
  { title: "Bamboo Shadow Waltz", artist: "Asian & Zen Lo-Fi" },
  { title: "Basement Groove 86", artist: "Retro Soul Bounce" }
];

export default function LofiPlayer({ isPlaying, onTogglePlay, rainActive, onToggleRain }) {
  const [trackIndex, setTrackIndex] = useState(0);

  const nextTrack = () => {
    setTrackIndex((prev) => (prev + 1) % LOFI_TRACKS.length);
  };

  const current = LOFI_TRACKS[trackIndex];

  return (
    <div className="lofiPlayer">
      <div className="lofiPlayer__trackInfo">
        <div className="lofiPlayer__iconWrap">
          <Music size={15} className={isPlaying ? 'pulseIcon' : ''} />
        </div>
        <div className="lofiPlayer__text">
          <span className="lofiPlayer__title">{current.title}</span>
          <span className="lofiPlayer__artist">{current.artist}</span>
        </div>
      </div>

      <div className="lofiPlayer__controls">
        <button
          type="button"
          className={`lofiPlayer__button ${rainActive ? 'lofiPlayer__button--active' : ''}`}
          onClick={onToggleRain}
          title="Toggle Rain Ambience"
        >
          <CloudRain size={15} />
        </button>

        <button
          type="button"
          className="lofiPlayer__button lofiPlayer__button--play"
          onClick={onTogglePlay}
          title={isPlaying ? "Pause Beat" : "Play Beat"}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          className="lofiPlayer__button"
          onClick={nextTrack}
          title="Next Track"
        >
          <SkipForward size={15} />
        </button>
      </div>

      {isPlaying && (
        <div className="lofiWaveform">
          <span className="lofiBar" />
          <span className="lofiBar" />
          <span className="lofiBar" />
          <span className="lofiBar" />
        </div>
      )}
    </div>
  );
}
