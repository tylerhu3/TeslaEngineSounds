// Authentic Background Audio Keep-Alive & MediaSession Engine
// Features:
// 1. Looping silent HTML5 audio element (/audio/silence/silence-600.mp3) appended to DOM with volume=1
//    to maintain active mobile OS audio session in iOS Safari, Android Chrome, and Tesla Browser.
// 2. Full MediaSession API integration with dynamic accent-tinted artwork, real car metadata,
//    and lock-screen / steering wheel controls (play, pause, nexttrack, previoustrack).
// 3. Unthrottled Web Worker ticker running at ~33Hz to preserve physics and audio rendering
//    when requestAnimationFrame is suspended in the background.

const SILENCE_MP3_SRC = '/audio/silence/silence-600.mp3';

let keepAliveAudioEl = null;
let isKeepAliveWanted = false;
let currentMetadataSignature = '';
const artworkCache = new Map();

/**
 * Generate a dynamic 256x256 branded artwork icon tinted to scene accent color.
 * Uses dynamic canvas tile generator with dark background and speed dial styling.
 */
export function generateArtworkIcon(accentColor = '#f7b733') {
  if (typeof document === 'undefined') return '';
  if (artworkCache.has(accentColor)) {
    return artworkCache.get(accentColor);
  }

  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Dark sleek backstage background (#171a20)
    ctx.fillStyle = '#171a20';
    ctx.fillRect(0, 0, size, size);

    // Glowing radial aura in scene accent color
    const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.48);
    grad.addColorStop(0, accentColor + '44');
    grad.addColorStop(0.7, accentColor + '15');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Outer accent circular ring
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cockpit speed gauge arc
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.26, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    // Rev gauge needle pointing at high RPM
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(
      size / 2 + Math.cos(Math.PI * 1.62) * size * 0.22,
      size / 2 + Math.sin(Math.PI * 1.62) * size * 0.22
    );
    ctx.stroke();

    // Center hub
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    const dataUrl = canvas.toDataURL('image/png');
    artworkCache.set(accentColor, dataUrl);
    return dataUrl;
  } catch (err) {
    console.debug('Failed to generate artwork icon:', err);
    return '';
  }
}

/**
 * Get or create the HTML5 audio element for silence loop.
 * Must be attached to document.body and have volume=1 so mobile browsers recognize active media.
 */
export function getOrCreateKeepAliveElement() {
  if (typeof document === 'undefined') return null;
  if (keepAliveAudioEl && document.body.contains(keepAliveAudioEl)) {
    return keepAliveAudioEl;
  }

  let existing = document.getElementById('tesla-keep-alive-audio');
  if (existing) {
    keepAliveAudioEl = existing;
    return keepAliveAudioEl;
  }

  try {
    const audio = document.createElement('audio');
    audio.id = 'tesla-keep-alive-audio';
    audio.loop = true;
    audio.volume = 1.0; // Real silence MP3 has zero dB PCM; volume=1 ensures OS grants background power exemption
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.style.position = 'fixed';
    audio.style.left = '-9999px';
    audio.style.top = '-9999px';
    audio.style.width = '1px';
    audio.style.height = '1px';
    audio.style.opacity = '0.001';
    audio.style.pointerEvents = 'none';

    const source = document.createElement('source');
    source.type = 'audio/mpeg';
    source.src = SILENCE_MP3_SRC;
    audio.appendChild(source);

    // Auto-resume if mobile OS / Tesla browser pauses it while background audio is active
    audio.addEventListener('pause', () => {
      if (isKeepAliveWanted && audio.paused) {
        audio.play().catch(() => {});
      }
    });

    audio.addEventListener('ended', () => {
      if (isKeepAliveWanted) {
        audio.play().catch(() => {});
      }
    });

    document.body.appendChild(audio);
    keepAliveAudioEl = audio;
    return keepAliveAudioEl;
  } catch (err) {
    console.debug('Error creating keep-alive audio element:', err);
    return null;
  }
}

/**
 * Control background keep-alive audio playback.
 */
export function syncBackgroundKeepAlive(shouldPlay) {
  isKeepAliveWanted = shouldPlay;
  const audio = getOrCreateKeepAliveElement();
  if (!audio) return;

  if (shouldPlay) {
    if (audio.paused) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.debug('Keep-alive audio play postponed until gesture:', err);
        });
      }
    }
  } else {
    if (!audio.paused) {
      audio.pause();
    }
  }
}

/**
 * Legacy alias for initial unlock gesture
 */
export function enableBackgroundAudioKeepAlive() {
  syncBackgroundKeepAlive(true);
}

/**
 * Update the MediaSession API metadata and playback state
 */
export function updateMediaSession(scene, {
  isRunning = true,
  isBackgroundAudio = true,
  isLofiPlaying = false,
  lofiTrack = null,
  onPlay = null,
  onPause = null,
  onNext = null,
  onPrev = null
} = {}) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !window.MediaMetadata) {
    return;
  }

  try {
    if (!isBackgroundAudio || !isRunning) {
      currentMetadataSignature = '';
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    navigator.mediaSession.playbackState = 'playing';

    const title = isLofiPlaying && lofiTrack?.title
      ? lofiTrack.title
      : (scene?.name || 'Road 66');

    const artist = isLofiPlaying && lofiTrack?.artist
      ? `Tesla Sounds · ${scene?.name || 'Lo-fi'}`
      : `Tesla Sounds · ${scene?.name || 'Virtual Cockpit'}`;

    const album = isLofiPlaying && lofiTrack?.artist
      ? lofiTrack.artist
      : (scene?.specs?.engine ? `${scene.specs.engine} — ${scene.tagline || ''}` : scene?.tagline || 'Virtual Engine Simulator');

    const accent = scene?.accent || '#f7b733';
    const signature = `${title}|${artist}|${album}|${accent}|${isLofiPlaying}`;

    if (signature !== currentMetadataSignature) {
      currentMetadataSignature = signature;
      const artworkIcon = generateArtworkIcon(accent);
      const artworks = [];
      if (artworkIcon) {
        artworks.push({ src: artworkIcon, sizes: '256x256', type: 'image/png' });
      }
      if (scene?.image) {
        artworks.push({ src: scene.image, sizes: '512x512', type: 'image/webp' });
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: artworks
      });
    }

    // Register mobile OS / Tesla media bar action handlers
    if (onPlay) {
      navigator.mediaSession.setActionHandler('play', () => {
        onPlay();
        syncBackgroundKeepAlive(true);
        navigator.mediaSession.playbackState = 'playing';
      });
    }
    if (onPause) {
      navigator.mediaSession.setActionHandler('pause', () => {
        onPause();
      });
    }
    if (onNext) {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        onNext();
      });
    }
    if (onPrev) {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        onPrev();
      });
    }

    // Clear unused handlers for clean media notification
    ['stop', 'seekto', 'seekbackward', 'seekforward'].forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {}
    });
  } catch (e) {
    console.debug('MediaSession update notice:', e);
  }
}

// Background ticker: Web Worker that cannot be throttled by requestAnimationFrame or background tab policies
export function createBackgroundTicker(onTick) {
  let fallbackTimer = null;
  let workerRef = null;

  try {
    const workerScript = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (!timer) {
            timer = setInterval(function() {
              self.postMessage('tick');
            }, 30); // ~33 Hz
          }
        } else if (e.data === 'stop') {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    workerRef = new Worker(url);

    workerRef.onmessage = (e) => {
      if (e.data === 'tick') {
        onTick();
      }
    };
    workerRef.postMessage('start');
  } catch (e) {
    // Fallback to window.setInterval if Web Workers are restricted in environment
    fallbackTimer = setInterval(() => {
      onTick();
    }, 33);
  }

  return {
    dispose: () => {
      if (workerRef) {
        try {
          workerRef.postMessage('stop');
          workerRef.terminate();
        } catch {}
        workerRef = null;
      }
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }
  };
}
