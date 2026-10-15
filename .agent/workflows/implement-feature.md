# Workflow: Implement Feature (`/implement-feature`)

Use this workflow when implementing any new feature, soundscape, or significant capability in TeslaEngineSounds.

---

## Phase 1: Architecture & Planning (`@architect`)

1. **User Requirement Analysis**:
   - Assess requirement impact on audio, physics, graphics, or cockpit UI.
2. **Decomposition & Contract Definition**:
   - Determine which specialized agents are required.
   - Define data contracts (e.g. new telemetry fields, new settings state).
3. **Artifact Generation**:
   - Generate an implementation plan artifact with clear tasks and verification criteria.
4. **Handoff**:
   - Route tasks to the specialist agents.

---

## Phase 2: Domain Implementation

Depending on the feature scope, delegate to:

- **`@audio-simulation`**:
  * If the feature involves sound synthesis, WAV sample maps, transmission ratios, rev limiter tuning, or background keep-alive.
  * Ensures zero audio bleed and constant 60FPS memory safety.
- **`@canvas-graphics`**:
  * If the feature involves canvas scene shaders, parallax speed scaling, particle effects, or windshield rain physics.
  * Ensures 60FPS frame budget and DPI scaling.
- **`@cockpit-ui`**:
  * If the feature involves React components, HUD dials, modals, soundscape drawer, styling tokens, or localization strings.
  * Follows automotive ergonomics (44px touch targets, LHD/RHD).

---

## Phase 3: Quality & Architecture Review (`@qa-reviewer`)

1. **Build Verification**:
   - Run `npm run build` and ensure clean output.
2. **Architecture Compliance Audit**:
   - Confirm core engines did not import React/UI modules.
   - Confirm Web Audio graphs disconnect cleanly with micro-fades.
   - Check that no memory allocations were added to hot tick loops.
3. **Sign-off**:
   - Provide summary of verified changes and deployment readiness.
