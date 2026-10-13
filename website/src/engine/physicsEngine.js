// Vehicle dynamics and transmission physics simulator

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

export class VehiclePhysics {
  constructor(sceneSpecs) {
    this.updateSpecs(sceneSpecs);

    this.throttle = 0; // 0.0 to 1.0 (smoothed, actual throttle)
    this.targetThrottle = 0; // 0.0 to 1.0 (input target throttle)
    this.speedKmh = 0;
    this.rpm = this.idleRpm;
    this.gear = 1;
    this.isManual = false;
    this.accelerationMs2 = 0;
    
    // Shift state
    this.isShifting = false;
    this.shiftProgress = 0; // 0 to 1
    this.shiftWay = 0; // 1 = up, -1 = down
    this.shiftTimer = 0;

    // Limiter state
    this.isLimiterBouncing = false;
    this.limiterTimer = 0;

    // GPS mode
    this.isGpsActive = false;
    this.gpsWatchId = null;
    this.gpsSpeedKmh = 0;
  }

  updateSpecs(specs = {}) {
    this.idleRpm = specs.idleRpm || 800;
    this.redlineRpm = specs.redlineRpm || 8500;
    this.maxGears = Math.min(specs.gears || 6, STANDARD_GEAR_RATIOS.length);
    this.finalDrive = specs.finalDrive || 3.73;
    this.topSpeedKmh = specs.topSpeedKmh || 300;
    this.gearRatios = STANDARD_GEAR_RATIOS.slice(0, this.maxGears);
    if (this.gearRatios.length === 1) {
      this.gearRatios = [1.0];
    }
  }

  setThrottle(val) {
    this.targetThrottle = Math.max(0, Math.min(1, val));
  }

  shiftUp() {
    if (this.isShifting || this.gear >= this.maxGears) return false;
    this.gear += 1;
    this.isShifting = true;
    this.shiftWay = 1;
    this.shiftTimer = 0.15; // 150ms shift duration
    this.shiftProgress = 0;
    return true;
  }

  shiftDown() {
    if (this.isShifting || this.gear <= 1) return false;
    this.gear -= 1;
    this.isShifting = true;
    this.shiftWay = -1;
    this.shiftTimer = 0.14;
    this.shiftProgress = 0;
    return true;
  }

  toggleManual() {
    this.isManual = !this.isManual;
    return this.isManual;
  }

  startGpsTracking(onSuccess, onError) {
    if (!navigator.geolocation) {
      if (onError) onError(new Error("Geolocation not supported"));
      return;
    }
    this.isGpsActive = true;
    this.lastGpsCoords = null;
    this.lastGpsTimestamp = null;

    this.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        let speedKmh = null;

        // 1. Hardware/Doppler speed reported by device (in m/s)
        if (pos.coords.speed !== null && !isNaN(pos.coords.speed) && pos.coords.speed >= 0) {
          speedKmh = pos.coords.speed * 3.6;
        }
        // 2. Fallback: Haversine distance over elapsed time when coords.speed is null (e.g. mobile Safari)
        else if (this.lastGpsCoords && this.lastGpsTimestamp) {
          const dtSec = (pos.timestamp - this.lastGpsTimestamp) / 1000;
          if (dtSec > 0.35 && dtSec < 15) {
            const distMeters = this.calcHaversineDistance(
              this.lastGpsCoords.latitude,
              this.lastGpsCoords.longitude,
              pos.coords.latitude,
              pos.coords.longitude
            );
            const calcSpeedMs = distMeters / dtSec;
            speedKmh = calcSpeedMs > 0.5 ? calcSpeedMs * 3.6 : 0;
          }
        }

        if (speedKmh !== null) {
          // Stationary filter: ignore < 1.2 km/h GPS drift while parked
          this.gpsSpeedKmh = speedKmh < 1.2 ? 0 : Math.min(speedKmh, this.topSpeedKmh || 340);
        }

        this.lastGpsCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };
        this.lastGpsTimestamp = pos.timestamp;

        if (onSuccess) onSuccess(pos);
      },
      (err) => {
        if (onError) onError(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  calcHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  stopGpsTracking() {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }
    this.isGpsActive = false;
    this.lastGpsCoords = null;
    this.lastGpsTimestamp = null;
  }

  tick(dt = 0.016) {
    dt = Math.min(0.05, Math.max(0.001, dt));

    // 1. Progressive throttle modulation (smooth attack & release)
    // Squeezing the throttle takes ~0.60s to reach 100%, release takes ~0.24s
    const throttleAttackRate = 1.6;
    const throttleReleaseRate = 4.2;
    if (this.throttle < this.targetThrottle) {
      this.throttle = Math.min(this.targetThrottle, this.throttle + dt * throttleAttackRate);
    } else if (this.throttle > this.targetThrottle) {
      this.throttle = Math.max(this.targetThrottle, this.throttle - dt * throttleReleaseRate);
    }

    // 2. Shifting timer & animation progress
    if (this.isShifting) {
      const shiftDuration = this.shiftWay === 1 ? 0.15 : 0.14;
      this.shiftTimer -= dt;
      this.shiftProgress = Math.max(0, Math.min(1, 1 - (this.shiftTimer / shiftDuration)));
      if (this.shiftTimer <= 0) {
        this.isShifting = false;
        this.shiftProgress = 0;
      }
    }

    // GPS mode handling: driving real vehicle speed & acceleration
    if (this.isGpsActive) {
      const prevSpeed = this.speedKmh;
      // Exponential smoothing filter for GPS speed
      this.speedKmh += (this.gpsSpeedKmh - this.speedKmh) * Math.min(1, dt * 6.5);
      if (Math.abs(this.speedKmh - this.gpsSpeedKmh) < 0.2) {
        this.speedKmh = this.gpsSpeedKmh;
      }
      this.speedMph = this.speedKmh * 0.621371;

      // Acceleration in m/s^2
      this.accelerationMs2 = ((this.speedKmh - prevSpeed) / 3.6) / Math.max(0.001, dt);

      // In GPS mode, driver throttle effort is derived from vehicle acceleration:
      // Positive acceleration (e.g. 0 to 2.4 m/s^2) translates to dynamic throttle load (0.0 to 1.0)
      const accelThrottle = Math.max(0, Math.min(1, this.accelerationMs2 / 2.2));
      const cruiseFloor = this.speedKmh > 5 ? 0.12 : 0;
      this.throttle = Math.max(cruiseFloor, accelThrottle);

      const firstGearRatio = this.gearRatios[0] || 2.74;
      const firstGearTopSpeedKmh = 62;
      const rpmPerKmhFactor = (this.redlineRpm - this.idleRpm) / (firstGearTopSpeedKmh * (firstGearRatio * this.finalDrive));

      if (this.maxGears > 1) {
        for (let g = this.maxGears; g >= 1; g--) {
          const ratio = this.gearRatios[g - 1];
          const testRpm = this.idleRpm + (this.speedKmh * ratio * this.finalDrive * rpmPerKmhFactor);
          if (testRpm >= this.idleRpm + 400 || g === 1) {
            this.gear = g;
            this.rpm = Math.max(this.idleRpm, Math.min(this.redlineRpm, testRpm));
            break;
          }
        }
      } else {
        const norm = this.speedKmh / this.topSpeedKmh;
        this.rpm = this.idleRpm + (this.redlineRpm - this.idleRpm) * Math.min(1, norm);
      }
      return this.getState();
    }

    const currentRatio = this.gearRatios[this.gear - 1] || 1.0;
    // Effective throttle dips during gear changes (ignition cut emulation)
    const effectiveThrottle = this.isShifting ? 0.04 : this.throttle;

    // 3. Realistic mechanical drive ratios & torque distribution
    const firstGearRatio = this.gearRatios[0] || 2.74;
    // Mechanical advantage: 1.0 in 1st gear, down to ~0.35 in top gear
    const gearTorqueRatio = Math.max(0.2, currentRatio / firstGearRatio);
    const torqueFactor = 0.32 + 0.68 * gearTorqueRatio;

    // Aerodynamic drag increases with speed squared
    const speedRatio = Math.min(1.2, this.speedKmh / (this.topSpeedKmh || 280));
    const aeroDragKmhPerSec = Math.pow(speedRatio, 2) * 11.5;

    // Base acceleration capacity (km/h per second)
    // Tuned so full throttle acceleration via space bar is gradual, controllable, and authentic:
    // 0-60 km/h: ~5.5 seconds (gives rich acoustic time in 1st gear)
    // 0-100 km/h: ~9.2 seconds
    const baseAccelKmhPerSec = 10.8 * ((this.topSpeedKmh || 280) / 280);
    const maxAccelKmhPerSec = Math.max(0.8, (baseAccelKmhPerSec * torqueFactor) - aeroDragKmhPerSec);

    // Engine braking when coasting off-throttle
    const engineBraking = 8.0 + 2.0 * gearTorqueRatio;

    let speedDelta = 0;

    if (effectiveThrottle > 0.01) {
      // Natural sports car engine power curve: builds up progressively through revs
      const rpmNorm = Math.max(0, Math.min(1, (this.rpm - this.idleRpm) / Math.max(1, this.redlineRpm - this.idleRpm)));
      const powerCurve = 0.45 + 0.55 * Math.sin(rpmNorm * Math.PI * 0.9 + 0.1);
      const accelFactor = powerCurve * effectiveThrottle;
      speedDelta = maxAccelKmhPerSec * accelFactor * dt;
    } else if (this.speedKmh > 0.05) {
      // Decelerating / coasting with engine braking
      speedDelta = -Math.min(this.speedKmh, engineBraking * dt);
    } else {
      speedDelta = 0;
    }

    this.speedKmh = Math.max(0, Math.min(this.topSpeedKmh, this.speedKmh + speedDelta));
    this.accelerationMs2 = (this.speedKmh > 0.05 || effectiveThrottle > 0.01)
      ? (speedDelta / 3.6) / Math.max(0.001, dt)
      : 0;

    // 4. Transmission speed-to-RPM mechanical coupling
    // (1 / 3.6 / (2 * PI * 0.25)) * 60 * 4.6015 = 48.82 RPM per (km/h * gearRatio)
    // Calibrated so 1st gear tops out at ~60 km/h at redline, 2nd at ~85 km/h, 3rd at ~110 km/h, etc.
    const speedCoupledRpm = Math.max(this.idleRpm, this.speedKmh * currentRatio * 48.82);

    // 5. RPM state calculation
    if (this.speedKmh < 0.6) {
      // Standing at idle or stationary revving
      if (effectiveThrottle > 0.01) {
        // Free rev climb rate: revs up briskly to redline
        const freeClimbRate = (this.redlineRpm - this.idleRpm) * 0.85 * effectiveThrottle;
        this.rpm = Math.min(this.redlineRpm + 100, this.rpm + freeClimbRate * dt);
      } else {
        // Smooth return to idle
        this.rpm = Math.max(this.idleRpm, this.rpm - (this.rpm - this.idleRpm) * 4.2 * dt);
      }
    } else {
      // Moving in gear: RPM is mechanically coupled to transmission and speed
      const dynamicLead = effectiveThrottle * 180;
      const targetInGearRpm = speedCoupledRpm + dynamicLead;

      if (this.isShifting) {
        // Smooth rev drop/rise during shift duration
        this.rpm += (targetInGearRpm - this.rpm) * Math.min(1, dt * 14);
      } else {
        // Direct, solid mechanical coupling
        this.rpm += (targetInGearRpm - this.rpm) * Math.min(1, dt * 18);
      }

      this.rpm = Math.max(this.idleRpm, Math.min(this.redlineRpm + 250, this.rpm));
    }

    // 6. Automatic gear shifting (in Auto mode)
    if (!this.isManual && !this.isShifting && this.speedKmh >= 0.6) {
      const upshiftThreshold = Math.min(this.redlineRpm * 0.96, this.redlineRpm - 200);
      if (this.rpm >= upshiftThreshold && this.gear < this.maxGears && effectiveThrottle > 0.2) {
        this.shiftUp();
      }
      // Auto downshift when RPM drops too low in higher gears
      else if (this.gear > 1 && this.rpm < this.idleRpm + 800 && effectiveThrottle < 0.25) {
        this.shiftDown();
      }
    }

    // 7. Redline Limiter bounce when held at redline (in manual mode or top gear)
    if (this.rpm >= this.redlineRpm) {
      if (this.isManual || this.gear === this.maxGears) {
        this.isLimiterBouncing = true;
        this.limiterTimer += dt;
        const bounce = Math.sin(this.limiterTimer * 38);
        this.rpm = this.redlineRpm - (bounce > 0 ? 140 : 380);
      }
    } else {
      this.isLimiterBouncing = false;
      this.limiterTimer = 0;
    }

    return this.getState();
  }

  getState() {
    return {
      speedKmh: Math.max(0, this.speedKmh),
      speedMph: Math.max(0, this.speedKmh * 0.621371),
      rpm: Math.round(this.rpm),
      redlineRpm: this.redlineRpm,
      idleRpm: this.idleRpm,
      gear: this.gear,
      maxGears: this.maxGears,
      isManual: this.isManual,
      isShifting: this.isShifting,
      isLimiterBouncing: this.isLimiterBouncing,
      throttle: this.throttle,
      accelerationMs2: parseFloat(this.accelerationMs2.toFixed(1)),
      shiftProgress: this.shiftProgress,
      shiftWay: this.shiftWay || 1,
      isShiftReady: this.rpm >= this.redlineRpm * 0.82
    };
  }
}
