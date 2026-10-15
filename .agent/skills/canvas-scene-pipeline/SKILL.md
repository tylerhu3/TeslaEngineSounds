---
name: canvas-scene-pipeline
description: >-
  Use this skill when developing, profiling, or optimizing 2D procedural canvas shaders,
  road perspective rendering, precipitation physics, or 60FPS visual effects in sceneCanvasEngine.js and CanvasStage.jsx.
---

# Procedural Canvas & Scene Rendering Pipeline

This skill guides development in `website/src/engine/sceneCanvasEngine.js`, `website/src/engine/rainPhysicsEngine.js`, and `website/src/components/CanvasStage.jsx`.

---

## 1. Canvas 2D Perspective Projection

All 12 scenes share a unified pseudo-3D perspective model centered on an automotive horizon:

```text
Camera Position: (centerX, horizonY)
Focal Length: 300
Scale: 300 / Z
Projected X = centerX + WorldX * (300 / Z)
Projected Y = horizonY + CameraHeight * (300 / Z)
```

### 1.1 Horizon Pitch & Recoil
When the vehicle accelerates or shifts gears, the horizon line moves dynamically:
```javascript
const horizonY = height * (0.56 + pitchOffset(shiftProgress, shiftWay));
```
- Upshift creates forward lurch (recoil down).
- Downshift creates rearward pitch (recoil up).

---

## 2. 60FPS Optimization Rules

### 2.1 Backing Store & High DPI
Always scale canvas dimensions by `devicePixelRatio` (capped at 2 for performance) on resize:
```javascript
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.floor(width * dpr);
canvas.height = Math.floor(height * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```
Never modify `canvas.width` or `canvas.height` on every animation frame, as this purges the GPU texture cache.

### 2.2 Particle Recycling
In `MotionRainController` and starfield shaders:
- Pre-allocate particle arrays (streaks, beads, stars) in `initPools()`.
- When a particle exits the bottom or side of the viewport, reset its coordinates to the top. Never push/pop/splice inside the animation loop.

---

## 3. Rain Physics Pipeline (`rainPhysicsEngine.js`)

The windshield rain simulation consists of three distinct visual layers:
1. **Falling Streaks**: Long vertical lines angled proportionally to lateral vehicle velocity. Depth parameter ($0.35$ to $1.0$) determines thickness and speed.
2. **Static Beads**: Small stationary moisture droplets clinging to the outer glass.
3. **Wind-Sheared Droplets**: Droplets swept upwards and outwards across the windshield as aerodynamic drag increases ($v^2$).

---

## 4. Verification & Benchmarking
1. Open DevTools Performance tab.
2. Record 5 seconds of active driving.
3. Ensure no Long Tasks (>50ms) occur and frame time remains $< 16.6\text{ ms}$.
4. Verify ResizeObserver disconnects properly on component unmount.
