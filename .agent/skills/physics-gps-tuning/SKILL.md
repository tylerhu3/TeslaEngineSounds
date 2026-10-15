---
name: physics-gps-tuning
description: >-
  Use this skill when modifying, calibrating, or testing vehicle dynamics, transmission gear ratios,
  automatic upshift/downshift kickdown algorithms, or GPS Doppler telemetry tracking in physicsEngine.js.
---

# Vehicle Physics & GPS Telemetry Calibration

This skill provides the domain procedures for tuning vehicle dynamics, transmission algorithms, and GPS telemetry in `website/src/engine/physicsEngine.js`.

---

## 1. Transmission Gear Ratios & RPM Calculations

The engine uses standard 8-speed gear ratios coupled to vehicle speed:
```javascript
export const STANDARD_GEAR_RATIOS = [
  2.74, // 1st driving gear (0 to 60 km/h)
  2.02, // 2nd driving gear (60 to 85 km/h)
  1.57, // 3rd driving gear (85 to 112 km/h)
  1.27, // 4th driving gear (112 to 138 km/h)
  1.08, // 5th driving gear (138 to 164 km/h)
  0.90, // 6th driving gear (164 to 220 km/h)
  0.78, // 7th overdrive (220 to 280 km/h)
  0.68  // 8th overdrive (280+ km/h)
];
```

### Formula for Mechanical In-Gear RPM
$$\text{RPM}_{\text{speed}} = \text{Speed}_{\text{km/h}} \times \text{Ratio}_{\text{gear}} \times 48.82$$

When stationary ($\text{Speed} < 0.6\text{ km/h}$), the engine revs freely with throttle attack rate `(redlineRpm - idleRpm) * 0.85 * throttle`.

---

## 2. Dynamic Automatic Shifting Logic

### 2.1 Upshift Threshold
Upshift occurs dynamically depending on engine load (throttle + vehicle acceleration):
- **Cruising / Light Throttle**: Upshifts early at $\approx 38\% - 44\%$ of the rev range.
- **Wide Open Throttle (WOT)**: Holds gear until $\approx 94\%$ of redline.
- **Cooldown**: Minimum 1.6s between upshifts to prevent rapid cycling.

### 2.2 Downshift Logic & Kickdown
- **Coasting Downshift**: Triggers when RPM drops below $\text{idleRpm} + 650$.
- **Kickdown**: Triggers under hard acceleration if:
  $$\text{load} > 0.72 \land \text{throttle} > 0.60 \land \text{RPM} < \text{idle} + (\text{redline} - \text{idle}) \times 0.38$$
  provided the target lower gear will not exceed $88\%$ of redline (over-rev protection).

---

## 3. GPS Geolocation Tracking & Filters

### 3.1 Doppler Hardware Speed vs Haversine Fallback
1. Read `pos.coords.speed` (reported by device GPS chipset in $m/s$). If valid: $\text{speedKmh} = \text{speed} \times 3.6$.
2. Fallback: If `coords.speed` is null (common on certain mobile web browsers), compute Haversine distance between sequential coordinates over $\Delta t$.
3. Stationary Filter: If $\text{speedKmh} < 1.2\text{ km/h}$, force to 0.
4. Exponential Low-Pass Filter: Smooth raw GPS jitter:
   $$\text{speed}_{\text{smooth}} \leftarrow \text{speed}_{\text{smooth}} + (\text{gpsSpeed} - \text{speed}_{\text{smooth}}) \times \min(1, \Delta t \times 5.0)$$

---

## 4. Testing Procedure

When calibrating `physicsEngine.js`:
1. Verify idle stability: with throttle 0, RPM must remain exactly at `idleRpm` ($\pm 1$).
2. Test full acceleration climb: verify shifts occur sequentially from 1st through top gear without skipping gears.
3. Verify kickdown: accelerate to 4th gear cruising, press full throttle, ensure downshift to 3rd or 2nd occurs smoothly.
4. Verify rev limiter bounce: hold throttle in manual mode at redline; ensure oscillation occurs at $\approx 38\text{ Hz}$.
