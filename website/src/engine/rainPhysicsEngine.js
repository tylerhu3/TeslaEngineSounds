// DRIBE Motion-Reactive Rain Physics Engine
// Realistic automotive rain: continuous downward rainfall with speed-proportional
// lateral perspective sweep. Zero sci-fi starburst or central convergence.

export class MotionRainController {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d') || null;

    this.width = 0;
    this.height = 0;
    this.dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    // 1. Airborne falling rain streaks
    this.streaks = [];
    this.maxStreaks = 340;

    // 2. Static resting glass beads (wet windshield surface texture)
    this.staticBeads = [];
    this.maxStaticBeads = 120;

    // 3. Wind-sheared surface droplets on windshield glass
    this.shearedBeads = [];
    this.maxShearedBeads = 40;

    // Motion telemetry
    this.speedKmh = 0;
    this.acceleration = 0;
    this.throttle = 0;

    this.initPools();
    this.resize();
  }

  initPools() {
    this.streaks = [];
    this.staticBeads = [];
    this.shearedBeads = [];

    const w = this.width || 1200;
    const h = this.height || 800;

    // 1. Populate falling streaks uniformly across entire screen
    for (let i = 0; i < this.maxStreaks; i++) {
      this.streaks.push(this.createStreak(w, h, true));
    }

    // 2. Static windshield droplets uniformly scattered across entire glass
    for (let i = 0; i < this.maxStaticBeads; i++) {
      this.staticBeads.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: 0.8 + Math.random() * 1.4,
        alpha: 0.3 + Math.random() * 0.45,
        isTrickling: false,
        trickleSpeed: 0
      });
    }

    // 3. Wind-sheared surface droplets uniformly scattered across lower windshield
    for (let i = 0; i < this.maxShearedBeads; i++) {
      this.shearedBeads.push(this.createShearedBead(w, h, true));
    }
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width, window.innerWidth || 1200);
    const h = Math.max(rect.height, window.innerHeight || 800);

    this.width = w;
    this.height = h;
    this.dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  createStreak(w, h, randomY = false) {
    return {
      x: Math.random() * (w + 160) - 80,
      y: randomY ? Math.random() * h : -Math.random() * 80,
      depth: 0.35 + Math.random() * 0.65, // 0.35 (distant/fine) to 1.0 (close/fast)
      speedBase: 1950 + Math.random() * 750,
      alpha: 0.3 + Math.random() * 0.45,
      seed: Math.random() * 10
    };
  }

  createShearedBead(w, h, randomY = false) {
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h * (0.35 + Math.random() * 0.65),
      radius: 0.8 + Math.random() * 1.3,
      alpha: 0.3 + Math.random() * 0.45,
      seed: Math.random() * 50
    };
  }

  updateMotionState(speedKmh, acceleration, throttle) {
    this.speedKmh = Math.max(0, speedKmh || 0);
    this.acceleration = acceleration || 0;
    this.throttle = Math.max(0, Math.min(1, throttle || 0));
  }

  draw(dt = 0.016) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const speedNorm = Math.min(this.speedKmh / 140, 1.8);
    const accelNorm = Math.max(0, this.acceleration / 4) + this.throttle * 0.35;
    const isMoving = this.speedKmh > 8;

    const cx = w * 0.5;

    // =========================================================================
    // 1. AIRBORNE FALLING RAIN STREAKS
    // =========================================================================
    // Realistic driving rain: rain always falls DOWN from the sky.
    // As vehicle speed rises, lateral perspective sweep fans the rain outward
    // toward the sides, but downward gravity velocity remains dominant!
    ctx.lineCap = 'round';

    const baseStreakLen = 28 + speedNorm * 38 + accelNorm * 18;

    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];

      // Distance from vertical centerline: -1.0 (left) to +1.0 (right)
      const centerRatio = (s.x - cx) / (w * 0.5);

      // Lateral perspective deflection: fans outward to left/right with speed
      const lateralSweep = centerRatio * (this.speedKmh * 8.5 + accelNorm * 180);

      // Downward velocity: always strongly positive (rain falls from sky)
      const downwardSpeed = s.speedBase + this.speedKmh * 12 + accelNorm * 220;

      const vx = (-120 + lateralSweep) * s.depth;
      const vy = downwardSpeed * s.depth;

      // Update position
      s.x += vx * dt;
      s.y += vy * dt;

      // Calculate streak tail along motion vector
      const vLen = Math.hypot(vx, vy) || 1;
      const dirX = vx / vLen;
      const dirY = vy / vLen;
      const streakLen = baseStreakLen * s.depth;

      const tailX = s.x - dirX * streakLen;
      const tailY = s.y - dirY * streakLen;

      // Boundary check: respawn continuously at top of sky
      if (s.y > h + 60 || s.x < -80 || s.x > w + 80) {
        s.x = Math.random() * (w + 160) - 80;
        s.y = -Math.random() * 50;
        s.depth = 0.35 + Math.random() * 0.65;
        continue;
      }

      // Draw streak
      const alpha = (s.depth * s.alpha * (0.55 + speedNorm * 0.3)).toFixed(3);
      ctx.strokeStyle = `rgba(205, 228, 248, ${alpha})`;
      ctx.lineWidth = Math.max(0.7, s.depth * 1.5);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    // =========================================================================
    // 2. STATIC WINDSHIELD GLASS BEADS (WET WINDSHIELD TEXTURE)
    // =========================================================================
    for (let i = 0; i < this.staticBeads.length; i++) {
      const b = this.staticBeads[i];

      // At low speed, occasional heavy drop trickles straight down
      if (!isMoving && Math.random() < 0.003 && !b.isTrickling) {
        b.isTrickling = true;
        b.trickleSpeed = 480 + Math.random() * 380;
      }

      if (b.isTrickling) {
        b.y += b.trickleSpeed * dt;
        if (b.y > h + 10) {
          b.y = -5;
          b.x = Math.random() * w;
          b.isTrickling = false;
        }
      }

      // Droplet body
      ctx.fillStyle = `rgba(180, 215, 235, ${(b.alpha * 0.32).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // Sharp specular glint
      ctx.fillStyle = `rgba(255, 255, 255, ${(b.alpha * 0.75).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    // =========================================================================
    // 3. AERODYNAMIC WIND-SHEARED DROPLETS ON WINDSHIELD
    // =========================================================================
    if (isMoving) {
      const shearLift = (420 + this.speedKmh * 10 + accelNorm * 220); // upward velocity
      const shearSide = (320 + this.speedKmh * 8 + accelNorm * 180); // outward velocity

      for (let i = 0; i < this.shearedBeads.length; i++) {
        const d = this.shearedBeads[i];

        // Airflow vectors across windshield glass
        const centerRatio = (d.x - cx) / (w * 0.5);
        const vx = centerRatio * shearSide + Math.sin(d.y * 0.03 + d.seed) * 20;
        const vy = -shearLift;

        d.x += vx * dt;
        d.y += vy * dt;

        // Check bounds: respawn uniformly across lower windshield
        if (d.x < -30 || d.x > w + 30 || d.y < -30) {
          this.shearedBeads[i] = this.createShearedBead(w, h, false);
          continue;
        }

        // Draw fine streamline tail (clean 1px wet trail)
        const vDist = Math.hypot(vx, vy) || 1;
        const nx = vx / vDist;
        const ny = vy / vDist;
        const tailLen = Math.min(16, 5 + speedNorm * 6 + accelNorm * 4);

        ctx.strokeStyle = `rgba(215, 235, 255, ${(d.alpha * 0.38).toFixed(2)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(d.x - nx * tailLen, d.y - ny * tailLen);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();

        // Droplet head bead
        ctx.fillStyle = `rgba(255, 255, 255, ${(d.alpha * 0.82).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  destroy() {
    this.streaks = [];
    this.staticBeads = [];
    this.shearedBeads = [];
  }
}
