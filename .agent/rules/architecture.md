# Architecture Rules & System Invariants

This file specifies architectural invariants that must be strictly enforced when developing within `TeslaEngineSounds`.

---

## 1. Engine & UI Separation
- `website/src/engine/` contains pure TypeScript/JavaScript domain engines (`physicsEngine.js`, `audioEngine.js`, `backgroundAudio.js`, `rainPhysicsEngine.js`, `sceneCanvasEngine.js`).
- **RULE**: Engine modules MUST NEVER import React, JSX, or component-specific hooks.
- **RULE**: UI components (`website/src/components/*`) access engine state exclusively through defined controller interfaces or read-only snapshots (`physicsRef.current.getState()`).

---

## 2. Audio Engine Safety & Lifecycle
- **RULE**: Every Web Audio `AudioNode` must be disconnected prior to garbage collection.
- **RULE**: To eliminate audio bleeding or click artifacts, engines must execute a micro-gain ramp (20ms to 40ms) down to 0 before stopping sources or disposing graphs.
- **RULE**: Asynchronous sound preset changes must be guarded with `transitionSeq`. If a user triggers another soundscape while a previous one is loading, the outdated result must be immediately discarded.
- **RULE**: Never create unmuted oscillators or audio nodes without a master gain stage in between.

---

## 3. Vehicle Physics & GPS Telemetry
- **RULE**: Stationary GPS drift must be filtered out. When velocity drops below 1.2 km/h (0.75 mph), velocity must clamp to 0 km/h to prevent RPM surging while parked.
- **RULE**: When geolocation permission is denied or unsupported, physics must seamlessly fallback to interactive simulation mode (`isSimulated = true`).
- **RULE**: Automatic gear shifting must include cooldown timers (min 1.2s to 1.6s) to prevent rapid erratic gear hunting.

---

## 4. Background Audio Persistence
- **RULE**: Never remove or alter the silent HTML5 audio element (`#tesla-keep-alive-audio`). Mobile Safari, Android Chrome, and Tesla in-car browsers require active media playback to keep the Web Audio engine running when the screen locks.
- **RULE**: The Web Worker ticker in `backgroundAudio.js` must remain operational to tick physics and audio when `requestAnimationFrame` is suspended by the browser.

---

## 5. Hot Loop Performance (Zero Allocations)
- **RULE**: The 60FPS RAF loop and Web Worker ticks are time-critical paths.
- **RULE**: Do NOT instantiate objects (`{}`), arrays (`[]`), regexes, or closure callbacks inside `VehiclePhysics.tick()`, `engineAudio.update()`, or canvas `draw()`. Reuse instance variables.

---

## 6. Styling & Design System
- **RULE**: Adhere strictly to CSS variables defined in `website/src/styles/index.css`. Do not hardcode magic color hex codes inside components.
- **RULE**: Cockpit touch targets must be at least 44x44px.
- **RULE**: Support left-hand and right-hand drive layout modes (`.appShell--wheelRight`).
