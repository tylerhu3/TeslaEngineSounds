# Workflow: Architecture Review (`/architecture-review`)

Use this workflow to perform an architectural health audit across `TeslaEngineSounds`.

---

## Step 1: Boundary & Layer Audit (`@architect`)

1. Check imports in `website/src/engine/*`:
   - Must contain NO imports from `react`, `react-dom`, or `website/src/components/*`.
2. Check imports in `website/src/components/*`:
   - Components must not manipulate internal private variables of `engineAudio` or `VehiclePhysics`.
   - Access should only occur through public controller methods or read-only `.getState()` snapshots.

---

## Step 2: Audio Graph & Lifecycle Audit (`@audio-simulation`)

1. Verify AudioNode disposal:
   - Ensure every `createBufferSource()` has an associated `stop()` and `disconnect()` on engine transition.
   - Verify `transitionSeq` checks are present in all async loading functions.
2. Check background audio persistence:
   - Confirm `#tesla-keep-alive-audio` remains intact in `backgroundAudio.js`.
   - Verify `createBackgroundTicker` Web Worker message handlers are active.

---

## Step 3: Performance & 60FPS Budget Audit (`@canvas-graphics`)

1. Review `draw()` loops in `sceneCanvasEngine.js` and `rainPhysicsEngine.js`:
   - Confirm zero allocations (`new Array()`, `new Object()`, or closures) in animation loops.
   - Verify canvas sizing uses `devicePixelRatio` clamp (max 2).

---

## Step 4: Quality Sign-Off (`@qa-reviewer`)

1. Execute production build:
   ```bash
   npm run build
   ```
2. Verify Netlify configuration:
   - Check `netlify.toml` redirects and Node version specification.
3. Emit structured Architecture Review Report artifact.
