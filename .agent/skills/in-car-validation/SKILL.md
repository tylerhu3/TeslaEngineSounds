---
name: in-car-validation
description: >-
  Use this skill to validate Tesla in-car browser compatibility, touch target ergonomics,
  MediaSession metadata, silent background audio persistence, and Netlify deployment readiness.
---

# Tesla In-Car & Mobile Browser Validation

This skill outlines the validation checklist and testing procedures for verifying compatibility with the Tesla in-car browser (Chromium based on Linux), mobile devices (iOS Safari, Android Chrome), and production Netlify deployment.

---

## 1. Tesla In-Car Display Specifications

| Vehicle Model | Display Resolution | Aspect Ratio | Browser Engine |
| :--- | :--- | :--- | :--- |
| **Model 3 / Model Y** | 1920 × 1200 | 16:10 Landscape | Chromium Embedded |
| **Model S / Model X (Plaid)**| 2200 × 1300 | 17:10 Landscape | Chromium Embedded |
| **Cybertruck** | 2560 × 1600 | 16:10 Landscape | Chromium Embedded |

### Ergonomic Invariants
- **Touch Target Size**: Minimum 44 × 44 CSS pixels for every interactive button, tab, and pedal to accommodate touch while in motion.
- **Steering Wheel Handedness**: Test both Left-Hand Drive and Right-Hand Drive (`.appShell--wheelRight`). Ensure the Soundscapes drawer tab and pedal controls do not collide with vehicle UI bezels.

---

## 2. Background Media Persistence Checklist

In the Tesla browser, switching to Full-Screen Navigation or closing the browser window causes Chromium to throttle background tabs.

Verify the following:
1. **Silent Keep-Alive Loop**:
   - Check that `#tesla-keep-alive-audio` is mounted to `document.body` and has `volume = 1.0`.
   - Audio file `/audio/silence/silence-600.mp3` returns HTTP 200 / HTTP 206 (Range request).
2. **MediaSession Handlers**:
   - Verify `navigator.mediaSession.metadata` is populated with `title`, `artist: 'Tesla Cockpit'`, and dynamic artwork icon.
   - Test steering wheel controls: `play`, `pause`, `previoustrack`, `nexttrack`.
3. **Web Worker Ticker**:
   - Verify that when `document.hidden === true`, `createBackgroundTicker` continues to fire and execute `physicsRef.current.tick(dt)` and `engineAudio.update(...)`.

---

## 3. Production Build & Netlify Verification

Before committing changes:
```bash
# 1. Run production build
npm run build

# 2. Check build output directory
ls -lh dist/

# 3. Verify netlify redirect rules
grep -q "from = \"/*\"" netlify.toml
```

Ensure:
- Zero syntax errors or missing module imports.
- Total JavaScript chunk size remains under 500KB gzipped.
- Redirects in `netlify.toml` ensure single-page application deep routes resolve to `/index.html`.
