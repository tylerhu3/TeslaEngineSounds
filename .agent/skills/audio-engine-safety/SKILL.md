---
name: audio-engine-safety
description: >-
  Use this skill when modifying, debugging, or adding audio presets, synthesizer voices,
  sample-based ProCar audio buffers, Web Audio graphs, or background audio persistence
  in TeslaEngineSounds to guarantee zero audio bleeding and zero memory leaks.
---

# Audio Engine Safety & Web Audio Architecture

This skill provides step-by-step procedures and invariants for developing in `website/src/engine/audioEngine.js` and `website/src/engine/backgroundAudio.js`.

---

## 1. Web Audio Lifecycle & Clean Disposal

When modifying or creating an engine (synth or sample-based), follow the strict lifecycle pattern:

### 1.1 Micro-Fade Before Disconnect
Never abruptly stop an `AudioBufferSourceNode` or disconnect an `AudioNode` while audio is rendering; this causes an audible speaker click or pop.

```javascript
// Correct micro-fade disposal pattern
function fadeOutAndDispose(gainNode, ctx, onDone, durationMs = 35) {
  const now = ctx.currentTime;
  const durSec = durationMs / 1000;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0.0001, now + durSec);

  setTimeout(() => {
    try {
      gainNode.disconnect();
      if (onDone) onDone();
    } catch (e) {
      console.warn("Disposal warning:", e);
    }
  }, durationMs + 10);
}
```

### 1.2 Sequence Guarding for Asynchronous Presets
Because audio files load over network HTTP, rapid scene switching can cause older soundscapes to resolve after the user has switched to a new soundscape.

Always increment and check `transitionSeq`:
```javascript
async function loadEngine(voiceId) {
  const currentSeq = ++this.transitionSeq;
  const engine = await createEngine(voiceId);

  // Stale check
  if (this.transitionSeq !== currentSeq) {
    engine.dispose();
    return;
  }

  this.activeEngine = engine;
}
```

---

## 2. Audio Parameter Modulation

In `engineAudio.update(params)`:
- `speedKmh`, `acceleration`, `throttle`, `rpm`, `gear`, `isShifting`, `isLimiterBouncing`.
- Use exponential ramping (`setTargetAtTime`) with appropriate time constants:
  * Rev throttle attack: `0.04s` to `0.08s`
  * Overrun release: `0.12s` to `0.20s`
  * Gear shift torque cut: `0.015s`
- Never recreate biquad filter nodes or distortion wave-shapers on each tick. Pre-generate curves (`makeTanhCurve`) and reuse them.

---

## 3. Background Audio Keep-Alive Invariants

The background audio system (`backgroundAudio.js`) relies on:
1. `#tesla-keep-alive-audio`: An HTML5 audio element playing silence with `volume = 1.0` attached directly to the DOM.
2. Web Worker Ticker: An inline Blob worker running a `setInterval(..., 30)` that sends tick messages back to the main thread even when `requestAnimationFrame` is throttled by the OS.
3. MediaSession API: Synchronizes play/pause, next/previous scene, and dynamic canvas speed dial artwork.

Always test background survival by simulating visibility change:
```javascript
document.dispatchEvent(new Event('visibilitychange'));
```
