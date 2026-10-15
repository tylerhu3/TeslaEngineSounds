# TeslaEngineSounds: Multi-Agent Architecture & Operating Guidelines

This repository uses a specialized multi-agent architecture tailored for the high-performance, real-time automotive simulation domain of TeslaEngineSounds.

---

## 1. Domain & Architecture Overview

TeslaEngineSounds (v2.0.0) is a real-time virtual cockpit simulator running in web browsers, mobile devices, and Tesla in-car Chromium screens. It combines:
1. **Web Audio API**: Dual sound pipelines (ProCar granular sample playback + real-time synthesized harmonics).
2. **Vehicle Dynamics & GPS**: 8-speed automatic/manual transmission simulation with Doppler radar velocity tracking and kickdown logic.
3. **Procedural Canvas 2D Graphics**: 60FPS perspective shaders for 12 scenes and dynamic windshield rain particle physics.
4. **Background Persistence**: Silent audio DOM keep-alive loop, MediaSession API integration, and an unthrottled Web Worker ticker.

---

## 2. Agent Team Roster

Tasks in this repository must be routed to the appropriate specialized agent:

| Agent Name | Scope & Ownership | Primary Responsibilities |
| :--- | :--- | :--- |
| **`@architect`** | Architecture, ADRs, Interfaces | System design, task decomposition, API contracts, dependency boundaries. **Never writes production code.** |
| **`@audio-simulation`** | `website/src/engine/physicsEngine.js`<br/>`website/src/engine/audioEngine.js`<br/>`website/src/engine/backgroundAudio.js` | Web Audio graph, engine audio synthesis, sample crossfades, transmission physics, GPS Doppler tracking, background audio keep-alive. |
| **`@canvas-graphics`** | `website/src/engine/sceneCanvasEngine.js`<br/>`website/src/engine/rainPhysicsEngine.js`<br/>`website/src/components/CanvasStage.jsx` | 60FPS procedural canvas shaders, road perspective projection, particle effects, rain physics, DPI scaling. |
| **`@cockpit-ui`** | `website/src/components/*`<br/>`website/src/App.jsx`<br/>`website/src/styles/*`<br/>`website/src/data/*` | React UI, automotive HUD dials, theme system, soundscapes drawer, modal dialogues, keyboard/touch input, localization. |
| **`@qa-reviewer`** | Entire codebase (Read-Only + Build Verification) | Architecture compliance auditing, audio buffer leak checks, 60FPS frame budget inspection, build verification (`npm run build`). |

---

## 3. Strict Architectural Invariants

Every agent and developer must strictly adhere to these rules:

1. **Zero Allocations in Hot Tick Loops**:
   - Never allocate objects, arrays, closures, or strings inside `VehiclePhysics.tick()`, `engineAudio.update()`, or canvas `draw()` loops. Reuse internal state vectors and buffers to prevent GC stalls.
2. **Audio Leak & Bleed Prevention**:
   - Every `AudioNode` must be disconnected and buffer sources stopped with micro-fades before disposal.
   - Preset switches must be sequence-guarded (`transitionSeq`) so asynchronous sound loads never play if the user switched scenes before the load finished.
3. **GPS Stationary Filtering**:
   - Speeds below 1.2 km/h while stationary must be clamped to 0 to prevent audio RPM jitter at traffic stops.
4. **Background Persistence Protection**:
   - Never break the silent HTML5 audio loop (`#tesla-keep-alive-audio`) or the inline Web Worker ticker (`createBackgroundTicker`). They ensure audio continues when the Tesla screen is locked or running maps.
5. **Design System & Ergonomics**:
   - All styles must use CSS custom properties from `website/src/styles/index.css`.
   - Cockpit controls must maintain high touch targets (min 44px) and support both left-hand and right-hand drive steering wheel layouts (`appShell--wheelRight`).
6. **Interface Boundaries**:
   - Core engines (`physicsEngine.js`, `audioEngine.js`) must remain pure JavaScript modules decoupled from React runtime state.

---

## 4. Standard Feature Workflow

1. **Plan & Contract (`@architect`)**: Break down requirements, check constraints, produce implementation artifact.
2. **Execute (`@audio-simulation` / `@canvas-graphics` / `@cockpit-ui`)**: Implement changes strictly within designated file scopes.
3. **Verify (`@qa-reviewer`)**: Run `npm run build`, audit memory leaks and audio lifecycle, verify backwards compatibility.
