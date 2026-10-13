// Background audio keep-alive & ticker for mobile browsers (iOS Safari, Android Chrome, Tesla browser)
// Keeps Web Audio Context active when screen is locked or tab is hidden,
// and runs physics/audio updates via an unthrottled Web Worker timer.

const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

let keepAliveAudio = null;
let isKeepAliveStarted = false;

export function enableBackgroundAudioKeepAlive() {
  if (isKeepAliveStarted) return;
  isKeepAliveStarted = true;

  // 1. Silent HTML5 audio element loop
  // This informs iOS Safari / Android OS that media is playing so the OS audio session is not killed in the background.
  try {
    if (!keepAliveAudio && typeof Audio !== 'undefined') {
      keepAliveAudio = new Audio(SILENT_WAV);
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = 0.01;
      keepAliveAudio.setAttribute('playsinline', 'true');
      keepAliveAudio.setAttribute('webkit-playsinline', 'true');
      const p = keepAliveAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    }
  } catch (e) {
    console.debug('Background keep-alive audio init notice:', e);
  }

  // 2. MediaSession API integration
  try {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Tesla Engine Sounds',
        artist: 'Dribe Virtual Cockpit',
        album: 'Vehicle Audio Simulator'
      });
      navigator.mediaSession.playbackState = 'playing';

      // Handlers to satisfy mobile OS background media players
      navigator.mediaSession.setActionHandler('play', () => {
        keepAliveAudio?.play()?.catch(() => {});
        navigator.mediaSession.playbackState = 'playing';
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        navigator.mediaSession.playbackState = 'playing';
      });
    }
  } catch (e) {
    console.debug('MediaSession registration notice:', e);
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
