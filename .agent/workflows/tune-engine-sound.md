# Workflow: Tune Engine Sound (`/tune-engine-sound`)

Use this workflow to add a new engine voice preset, adjust transmission gear ratios, or refine acoustic harmonics in TeslaEngineSounds.

---

## Step 1: Define Engine Specification (`@architect`)

1. Identify vehicle profile attributes in `website/src/data/scenes.js`:
   - `id`: unique scene identifier
   - `voiceId`: synthesis preset or ProCar key
   - `accent`: brand hex color for speed dials and HUD
   - `specs`:
     * `engine`: Engine description (e.g. "4.0L Twin-Turbo Flat-Six")
     * `idleRpm`: e.g. 850
     * `redlineRpm`: e.g. 9000
     * `gears`: 6, 7, or 8
     * `finalDrive`: differential ratio (e.g. 3.73)
     * `topSpeedKmh`: top vehicle speed (e.g. 330)

---

## Step 2: Implement Audio Pipeline (`@audio-simulation`)

1. **If ProCar Sample-Based**:
   - Register sample audio maps in `PROCAR_CONFIGS` (`audioEngine.js`):
     * `on_low`, `on_high`, `off_low`, `off_high`, `limiter`, `idle`
     * Set reference RPM and volume curves.
   - Verify that idling audio from the previous preset instantly disposes without bleeding over.
2. **If Synthesizer Preset**:
   - Register harmonic nodes, waveshaper tanh curve, and biquad resonant filter cutoffs in `SYNTH_PRESETS` (`scenes.js`).
3. **Verify Shift Acoustics**:
   - Check torque cut duration (`0.015s` to `0.025s`) and exhaust burble / crackle triggers during downshifts.

---

## Step 3: Calibrate Transmission & Dynamics (`@audio-simulation`)

1. In `physicsEngine.js`, confirm that `STANDARD_GEAR_RATIOS` or custom gear arrays match the target rev drop per gear:
   $$\text{RPM}_{\text{new}} = \text{RPM}_{\text{old}} \times \frac{\text{Ratio}_{\text{next}}}{\text{Ratio}_{\text{curr}}}$$
2. Test both automatic cruising shifts (38-44% RPM) and full-throttle acceleration (94% RPM).

---

## Step 4: Verification & Audit (`@qa-reviewer`)

1. Test preset switching: rapid back-and-forth selection between the new preset and existing presets. Ensure zero audio crackle or ghost sound lingering.
2. Verify production build: `npm run build`.
