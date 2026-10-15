// Authentic Virtual Cockpit Audio Engine
// Supporting both real sampled ProCar engines (458, Miami, Autobahn, ProCar, Bac-Mono, Veiled)
// and pure synthesizer soundscapes (Apex V8, Plaid, Dune Runner, Alpine, Starliner, Neon Drive).

import { SYNTH_PRESETS } from '../data/scenes';

// Math helpers
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (val, min, max) => clamp((val - min) / (max - min), 0, 1);

// Distortion wave-shaping curves
function makeTanhCurve(amount = 0.34, n_samples = 1024) {
  const curve = new Float32Array(n_samples);
  const t = Math.max(0.001, clamp(amount, 0, 1) * 4.5);
  const normFactor = 1 / Math.tanh(t);
  for (let i = 0; i < n_samples; i++) {
    const x = (i * 2) / (n_samples - 1) - 1;
    curve[i] = Math.tanh(x * t) * normFactor;
  }
  return curve;
}

function makeCeilingCurve(n_samples = 1024) {
  const p = 1.9;
  const m = 0.96;
  const e = m / Math.tanh(p);
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; i++) {
    const r = (i * 2) / (n_samples - 1) - 1;
    curve[i] = Math.tanh(r * p) * e;
  }
  return curve;
}

function createNoiseBuffer(ctx, durationSec = 2) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * durationSec, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Lowpass muffle filter helper
function createMuffleFilter(ctx, initialFreq = 0) {
  const filter = ctx.createBiquadFilter();
  const nyquist = ctx.sampleRate / 2;
  const calcFreq = (val) => (val > 0 ? 20000 * Math.pow(420 / 20000, clamp(val, 0, 1.5)) : nyquist);
  filter.type = 'lowpass';
  filter.Q.value = 0.6;
  filter.frequency.value = calcFreq(initialFreq);

  let currentVal = initialFreq;
  return {
    node: filter,
    set: (val) => {
      if (val === currentVal) return;
      const timeConst = val < currentVal ? 0.12 : 0.5;
      currentVal = val;
      const targetFreq = calcFreq(val);
      const now = ctx.currentTime;
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setTargetAtTime(targetFreq, now, timeConst);
      filter.frequency.setValueAtTime(targetFreq, now + timeConst * 6);
    }
  };
}

// Cosine crossfade gains
function crossfadeGains(val, min, max) {
  const r = clamp((val - min) / (max - min), 0, 1);
  return {
    gain1: Math.cos((1 - r) * 0.5 * Math.PI),
    gain2: Math.cos(r * 0.5 * Math.PI)
  };
}

// Gearbox gear ratios
const GEAR_RATIOS = [7.08, 4.05, 2.74, 2.02, 1.57, 1.27, 1.08, 0.9];
const DEFAULT_WHEEL_RADIUS = 0.25;
const DEFAULT_FINAL_DRIVE = 8300 / ((60 / 3.6 / (2 * Math.PI * DEFAULT_WHEEL_RADIUS)) * 170);

const Se = 30 * Math.PI;

// Physics: Engine simulation class
class EngineSim {
  constructor(cfg = {}) {
    this.idle = cfg.idle ?? 1000;
    this.detune_slope = cfg.detune_slope ?? 0.2;
    this.limiter = cfg.limiter ?? 9000;
    this.soft_limiter = cfg.soft_limiter ?? 9000;
    this.limiter_ms = cfg.limiter_ms ?? 150;
    this.limiter_delay = cfg.limiter_delay ?? 100;
    this.inertia = cfg.inertia ?? 1;
    this.torque = cfg.torque ?? 400;
    this.engine_braking = cfg.engine_braking ?? 200;
    this.throttle_floor = cfg.throttle_floor ?? 0;
    this.crossfade_low = cfg.crossfade_low ?? 3000;
    this.crossfade_high = cfg.crossfade_high ?? 6500;
    this.idle_until = 0;
    this.idle_gone = 0;

    this.rpm = 1000;
    this.throttle = 0;
    this.theta = 0;
    this.omega = 1000 / Se;
    this.prevTheta = 0;
    this.dTheta = 0;
    this._limiterTriggerTime = 0;
  }

  integrate(load, now, dt) {
    if (this.rpm >= this.soft_limiter) {
      const e = norm(this.rpm, this.soft_limiter, this.limiter);
      this.throttle *= Math.pow(1 - e, 0.05);
    }
    if (this.rpm >= this.limiter) {
      this._limiterTriggerTime = now;
    }
    if (now - this._limiterTriggerTime >= this.limiter_ms) {
      const e = now - this._limiterTriggerTime;
      this.throttle *= norm(e, 0, this.limiter_delay);
    } else {
      this.throttle = 0;
    }

    let brakingBoost = 0;
    if (this.throttle < 0.1 && this.rpm < this.idle * 1.5) {
      brakingBoost = (1 - norm(this.rpm, this.idle * 0.9, this.idle)) * this.engine_braking * 10;
    }

    const torqueNet =
      Math.pow(Math.max(0, this.throttle), 1.2) * this.torque -
      Math.pow(Math.max(0, 1 - this.throttle), 1.2) * this.engine_braking +
      brakingBoost;

    const accel = torqueNet / (load + this.inertia);
    this.prevTheta = this.theta;
    this.omega += accel * dt;
    this.theta += this.omega * dt;
    this.dTheta = this.omega * dt;
    this.rpm = Math.max(200, this.omega * Se);
  }

  update(dt) {
    if (dt > 0) {
      this.omega = (this.theta - this.prevTheta) / dt;
    }
  }

  solvePos(drivetrain, dt) {
    if (drivetrain.gear === 0) return;
    const compliance = Math.max(6e-4 - 15e-5 * drivetrain.gear, 7e-5);
    const diff = drivetrain.theta - this.theta;
    const correction = this.getCorrection(diff, dt, compliance);
    this.theta += correction * Math.sign(diff);
  }

  solveVel(drivetrain, dt) {
    const damping = drivetrain.gear > 3 ? 9 : 12;
    this.omega += (drivetrain.omega - this.omega) * damping * dt;
  }

  getCorrection(diff, dt, compliance = 0) {
    const r = diff * diff * (1 / this.inertia);
    return diff * -(-diff / (r + compliance / (dt * dt)));
  }

  applySounds(nodes, masterGainScale = 1) {
    const n = this.rpm;
    const { gain1: r, gain2: i } = crossfadeGains(n, this.crossfade_low, this.crossfade_high);
    const { gain1: a, gain2: o } = crossfadeGains(this.throttle, 0, 1);
    const limiterGain = norm(n, this.soft_limiter * 0.93, this.limiter) * masterGainScale;

    const setLayer = (key, gainVal, applyDetune = true) => {
      const node = nodes[key];
      if (node) {
        if (applyDetune && node.audio && node.audio.detune) {
          node.audio.detune.value = (n - node.rpm) * this.detune_slope;
        }
        if (node.gain && node.gain.gain) {
          node.gain.gain.value = gainVal * node.volume;
        }
      }
    };

    const idleGain =
      nodes.idle && this.idle_gone > this.idle_until
        ? 1 - norm(n, this.idle_until, this.idle_gone)
        : 0;
    const activeEngineFactor = 1 - idleGain;

    setLayer('idle', idleGain, false);
    setLayer('on_low', a * i * activeEngineFactor);
    setLayer('off_low', o * i * activeEngineFactor);
    setLayer('on_high', a * r * activeEngineFactor);
    setLayer('off_high', o * r * activeEngineFactor);
    setLayer('limiter', limiterGain, false);
  }
}

// Physics: Drivetrain simulation class
class DrivetrainSim {
  constructor(cfg = {}) {
    this.gears = cfg.gears ?? GEAR_RATIOS;
    this.final_drive = cfg.final_drive ?? DEFAULT_FINAL_DRIVE;
    this.inertia = cfg.inertia ?? 0.15;
    this.damping = cfg.damping ?? 12;
    this.compliance = cfg.compliance ?? 0.01;
    this.shiftTime = cfg.shiftTime ?? 100;
    this.gear = 1;
    this.downShift = false;
    this.shifting = false;
    this.theta = 0;
    this.omega = 0;
    this.prevTheta = 0;
  }

  integrate(dt) {
    this.prevTheta = this.theta;
    this.theta += this.omega * dt;
  }

  update(dt) {
    if (dt > 0) {
      this.omega = (this.theta - this.prevTheta) / dt;
    }
  }

  solvePos(engine, dt) {
    const diff = engine.theta - this.theta;
    const correction = this.getCorrection(diff, dt, this.compliance);
    this.theta += correction * Math.sign(diff);
  }

  solveVel(engine, dt) {
    const damping = this.gear > 3 ? this.damping * 0.75 : this.damping;
    this.omega += (engine.omega - this.omega) * damping * dt;
  }

  getCorrection(diff, dt, compliance = 0) {
    const r = diff * diff * (1 / this.inertia);
    return diff * -(-diff / (r + compliance / (dt * dt)));
  }

  getGearRatio(g = this.gear) {
    const idx = clamp(g, 0, this.gears.length);
    return idx > 0 ? this.gears[idx - 1] ?? 0 : 0;
  }

  changeGear(newGear) {
    const oldRatio = this.getGearRatio(this.gear);
    const newRatio = this.getGearRatio(newGear);
    const ratioDelta = oldRatio > 0 ? newRatio / oldRatio : 0;
    if (ratioDelta !== 1) {
      this.gear = 0;
      this.shifting = true;
      if (ratioDelta > 1) this.downShift = true;
      setTimeout(() => {
        this.omega *= ratioDelta;
        this.gear = clamp(newGear, 0, this.gears.length);
        this.downShift = false;
        this.shifting = false;
      }, this.shiftTime);
    }
  }

  nextGear() {
    this.changeGear(this.gear + 1);
  }

  prevGear() {
    this.changeGear(this.gear - 1);
  }
}

// ProCar audio configuration profiles
export const PROCAR_CONFIGS = {
  procar: {
    engine: { limiter: 9000, soft_limiter: 9000, limiter_ms: 150, inertia: 1, idle: 800 },
    drivetrain: { shiftTime: 100, damping: 12 },
    lift: 0.6,
    sounds: [
      { key: 'on_low', src: '/audio/engine/procar-on-low.wav', rpm: 3200, volume: 1 },
      { key: 'on_high', src: '/audio/engine/procar-on-high.wav', rpm: 8000, volume: 1 },
      { key: 'off_low', src: '/audio/engine/procar-off-low.wav', rpm: 3400, volume: 1.3 },
      { key: 'off_high', src: '/audio/engine/procar-off-high.wav', rpm: 8430, volume: 1.3 },
      { key: 'limiter', src: '/audio/engine/procar-limiter.wav', rpm: 8000, volume: 0.35 }
    ],
    idle: { src: '/audio/autobahn/idle.wav', volume: 1.4, window: [1000, 2200] }
  },
  'bac-mono': {
    engine: { limiter: 9000, soft_limiter: 8950, limiter_ms: 0, inertia: 1 },
    drivetrain: { shiftTime: 50, damping: 16 },
    lift: 0.52,
    sounds: [
      { key: 'on_low', src: '/audio/engine/bac-on-low.wav', rpm: 1000, volume: 0.5 },
      { key: 'on_high', src: '/audio/engine/bac-on-high.wav', rpm: 1000, volume: 0.5 },
      { key: 'off_low', src: '/audio/engine/bac-on-low.wav', rpm: 1000, volume: 0.35 },
      { key: 'off_high', src: '/audio/engine/bac-on-high.wav', rpm: 1000, volume: 0.35 },
      { key: 'limiter', src: '/audio/engine/procar-limiter.wav', rpm: 8000, volume: 0.175 }
    ]
  },
  f458: {
    engine: { limiter: 8900, soft_limiter: 8800, limiter_ms: 0, inertia: 0.8 },
    drivetrain: { shiftTime: 80, damping: 6 },
    lift: 0.45,
    sounds: [
      { key: 'on_low', src: '/audio/engine/458-on-low.wav', rpm: 5300, volume: 1.5 },
      { key: 'on_high', src: '/audio/engine/458-on-high.wav', rpm: 7700, volume: 2.5 },
      { key: 'off_low', src: '/audio/engine/458-off-low.wav', rpm: 6900, volume: 1.4 },
      { key: 'off_high', src: '/audio/engine/458-off-high.wav', rpm: 7900, volume: 1.6 },
      { key: 'limiter', src: '/audio/engine/458-limiter.wav', rpm: 8800, volume: 0.6 }
    ]
  },
  miami: {
    engine: { limiter: 8350, soft_limiter: 8250, limiter_ms: 0, inertia: 0.8, crossfade_low: 4300, crossfade_high: 7000 },
    drivetrain: { shiftTime: 70, damping: 6 },
    lift: 0.26,
    sounds: [
      { key: 'on_low', src: '/audio/miami/med_on.wav', rpm: 3565, volume: 0.66 },
      { key: 'on_high', src: '/audio/miami/high_on.wav', rpm: 7250, volume: 0.82 },
      { key: 'off_low', src: '/audio/miami/med_off.wav', rpm: 3565, volume: 2.21 },
      { key: 'off_high', src: '/audio/miami/high_off.wav', rpm: 7250, volume: 2.77 },
      { key: 'limiter', src: '/audio/miami/maxRPM.wav', rpm: 7250, volume: 0.43 }
    ],
    character: {
      on: { src: '/audio/miami/aggressiveness_on_fx.wav', volume: 0.35 },
      off: { src: '/audio/miami/aggressiveness_off_fx.wav', volume: 0.3 },
      window: [2670, 5720]
    },
    popAndBang: {
      volume: 4,
      pitch: 1.2,
      window: [5800, 8400],
      short: [
        { src: '/audio/autobahn/int_crackle_1.wav', trim: 0.81 },
        { src: '/audio/autobahn/int_crackle_2.wav', trim: 0.85 },
        { src: '/audio/autobahn/int_crackle_3.wav', trim: 0.9 }
      ]
    },
    idle: { src: '/audio/miami/idle.wav', volume: 1.59, window: [1100, 2000] },
    veilHz: 4200
  },
  autobahn: {
    engine: { limiter: 8350, soft_limiter: 8250, limiter_ms: 0, inertia: 0.8, crossfade_low: 4300, crossfade_high: 7000 },
    drivetrain: { shiftTime: 80, damping: 6 },
    lift: 0.26,
    sounds: [
      { key: 'on_low', src: '/audio/autobahn/low_med_on.wav', rpm: 3430, volume: 0.78 },
      { key: 'on_high', src: '/audio/autobahn/high_on.wav', rpm: 7250, volume: 1.17 },
      { key: 'off_low', src: '/audio/autobahn/low_med_off.wav', rpm: 3430, volume: 1.51 },
      { key: 'off_high', src: '/audio/autobahn/very_high_off.wav', rpm: 7680, volume: 1.45 },
      { key: 'limiter', src: '/audio/autobahn/maxRPM.wav', rpm: 8800, volume: 0.79 }
    ],
    idle: { src: '/audio/autobahn/idle.wav', volume: 2.67, window: [1100, 2000] },
    popAndBang: {
      volume: 3,
      window: [3000, 8400],
      short: [
        { src: '/audio/autobahn/int_crackle_1.wav', trim: 0.81 },
        { src: '/audio/autobahn/int_crackle_2.wav', trim: 0.85 },
        { src: '/audio/autobahn/int_crackle_3.wav', trim: 0.9 }
      ],
      long: [
        { src: '/audio/autobahn/int_crackle_long_1.wav', trim: 0.69 }
      ]
    }
  },
  'procar-veiled': {
    engine: { limiter: 9000, soft_limiter: 9000, limiter_ms: 150, inertia: 1, idle: 800 },
    drivetrain: { shiftTime: 100, damping: 12 },
    lift: 0.46,
    veilHz: 420,
    sounds: [
      { key: 'on_low', src: '/audio/engine/procar-on-low.wav', rpm: 3200, volume: 1 },
      { key: 'on_high', src: '/audio/engine/procar-on-high.wav', rpm: 8000, volume: 1 },
      { key: 'off_low', src: '/audio/engine/procar-off-low.wav', rpm: 3400, volume: 1.3 },
      { key: 'off_high', src: '/audio/engine/procar-off-high.wav', rpm: 8430, volume: 1.3 },
      { key: 'limiter', src: '/audio/engine/procar-limiter.wav', rpm: 8000, volume: 0.35 }
    ]
  }
};

// Global audio buffer cache
const audioBufferCache = new Map();

async function fetchAudioBuffer(ctx, url) {
  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url);
  }
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  audioBufferCache.set(url, audioBuffer);
  return audioBuffer;
}

// Map scene/voiceId to procar key if applicable
export function getProcarKey(voiceId) {
  if (voiceId === 'procar' || voiceId === 'road-66') return 'procar';
  if (voiceId === 'italia' || voiceId === 'f458') return 'f458';
  if (voiceId === 'miami') return 'miami';
  if (voiceId === 'autobahn') return 'autobahn';
  if (voiceId === 'tokyo-six' || voiceId === 'sakura') return 'bac-mono';
  if (voiceId === 'chill-pad' || voiceId === 'chill') return 'procar-veiled';
  return null;
}

// 1. ProCar Sampled Engine Instance
async function createProcarEngine(benchId, muffleAmount = 0) {
  const cfg = PROCAR_CONFIGS[benchId];
  if (!cfg) return null;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx({ latencyHint: 'interactive' });
  await ctx.resume();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -3;
  compressor.knee.value = 1;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.1;
  masterGain.connect(compressor);

  const engineBus = ctx.createGain();
  const muffle = createMuffleFilter(ctx, muffleAmount);
  engineBus.connect(muffle.node);
  muffle.node.connect(masterGain);

  if (cfg.veilHz) {
    const veilFilter = ctx.createBiquadFilter();
    veilFilter.type = 'lowpass';
    veilFilter.frequency.value = cfg.veilHz;
    veilFilter.Q.value = 0.6;
    compressor.connect(veilFilter);
    veilFilter.connect(ctx.destination);
  } else {
    compressor.connect(ctx.destination);
  }

  // Load sound loop layers
  const soundNodes = {};
  const soundsToLoad = [...cfg.sounds, ...(cfg.idle ? [{ key: 'idle', src: cfg.idle.src, rpm: 0, volume: cfg.idle.volume }] : [])];

  await Promise.all(
    soundsToLoad.map(async (sound) => {
      try {
        const buffer = await fetchAudioBuffer(ctx, sound.src);
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(engineBus);
        source.start();
        soundNodes[sound.key] = {
          audio: source,
          gain: gain,
          rpm: sound.rpm,
          volume: sound.volume * (cfg.lift ?? 1)
        };
      } catch (err) {
        console.warn(`Could not load audio for ${sound.key}:`, err);
      }
    })
  );

  // Character layers (e.g. Miami aggressiveness fx)
  const characterNodes = [];
  for (const [charConfig, isOn] of [
    [cfg.character?.on, true],
    [cfg.character?.off, false]
  ]) {
    if (charConfig) {
      try {
        const buffer = await fetchAudioBuffer(ctx, charConfig.src);
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(engineBus);
        source.start(ctx.currentTime, Math.random() * buffer.duration);
        characterNodes.push({
          gain,
          audio: source,
          volume: charConfig.volume * (cfg.lift ?? 1),
          isOn
        });
      } catch {}
    }
  }

  // Pops & bangs crackle buffers
  const loadCrackles = async (list = []) => {
    const results = await Promise.all(
      list.map(async (item) => {
        try {
          const buffer = await fetchAudioBuffer(ctx, item.src);
          return {
            buffer,
            volume: (cfg.popAndBang?.volume ?? 1) * (item.trim ?? 1) * (cfg.lift ?? 1)
          };
        } catch {
          return null;
        }
      })
    );
    return results.filter(Boolean);
  };

  const shortCrackles = await loadCrackles(cfg.popAndBang?.short);
  const longCrackles = await loadCrackles(cfg.popAndBang?.long);

  const playOneShot = (item, opts = {}) => {
    if (!item || !item.buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = item.buffer;
    source.playbackRate.value = opts.rate ?? 1;
    gain.gain.value = item.volume * (opts.gain ?? 1);
    source.connect(gain);
    gain.connect(masterGain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(ctx.currentTime + (opts.delaySeconds ?? 0));
    return { source, gain };
  };

  // State
  let heat = 0;
  let readyForPop = false;
  let lastPopTime = -Infinity;
  let activePop = null;
  let lastGear = 1;
  const popWindow = cfg.popAndBang?.window ?? [3000, 8400];
  const popPitch = cfg.popAndBang?.pitch ?? 1;
  const maxLimiterRpm = cfg.engine.limiter ?? 9000;

  const triggerPop = (rpm) => {
    const normRpm = clamp((rpm - popWindow[0]) / Math.max(1, maxLimiterRpm - popWindow[0]), 0, 1);
    const useLong = longCrackles.length > 0 && heat >= 0.55 && normRpm >= 0.5;
    const pool = useLong ? longCrackles : shortCrackles;
    if (!pool.length) return;
    const crackle = pool[Math.floor(Math.random() * pool.length)];
    const delay = (140 + Math.random() * 140) / 1000;
    activePop = playOneShot(crackle, {
      gain: (0.55 + 0.45 * heat) * (0.8 + 0.2 * normRpm) * (0.85 + Math.random() * 0.25),
      rate: (0.97 + Math.random() * 0.06) * popPitch,
      delaySeconds: delay
    });
  };

  const engineSim = new EngineSim(cfg.engine);
  if (cfg.idle) {
    engineSim.idle_until = cfg.idle.window[0];
    engineSim.idle_gone = cfg.idle.window[1];
  }

  const drivetrainSim = new DrivetrainSim(cfg.drivetrain);
  let lastTimeMs = 0;
  let currentTargetGain = 0;
  const startTime = ctx.currentTime;

  const speedToRpm = (gear, speedKmh) => {
    const revs = (speedKmh / 3.6 / (2 * Math.PI * DEFAULT_WHEEL_RADIUS)) * 60;
    return Math.max(revs * drivetrainSim.getGearRatio(gear) * drivetrainSim.final_drive, 1050);
  };

  const P_smooth = (speedKmh) => {
    const t = clamp((speedKmh - 30) / 50, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const upshiftThreshold = (speedKmh) => lerp(speedToRpm(3, 30), 8300, P_smooth(speedKmh));
  const downshiftThreshold = (speedKmh) => lerp(2000, 3000, P_smooth(speedKmh));
  const calcTargetGear = (speedKmh) => {
    const targetRpm = lerp(3600, 7000, P_smooth(speedKmh));
    for (let g = 3; g <= drivetrainSim.gears.length; g++) {
      if (speedToRpm(g, speedKmh) <= targetRpm) return g;
    }
    return drivetrainSim.gears.length;
  };

  return {
    benchId,
    context: ctx,
    setMuffle: muffle.set,
    fadeIn: () => {
      currentTargetGain = 0;
      try {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.25, now + 0.08);
      } catch {}
    },
    getTelemetry: () => ({
      rpm: Math.round(engineSim.rpm),
      gear: Math.max(1, drivetrainSim.gear >= 3 ? drivetrainSim.gear - 2 : 1),
      throttle: engineSim.throttle,
      isShifting: drivetrainSim.shifting,
      heat
    }),
    update: (isThrottle, outputGain, speedKmh, accelOrEffort, customRev = null, targetGear = 1) => {
      const nowMs = performance.now();
      const dt = lastTimeMs ? clamp((nowMs - lastTimeMs) / 1000, 0, 0.1) : 0;
      lastTimeMs = nowMs;
      if (dt === 0) return;

      const hasSpeed = speedKmh > 8 && accelOrEffort > -0.5;
      const targetThrottle = isThrottle
        ? 1
        : clamp(Math.max(accelOrEffort / 2.5, hasSpeed ? engineSim.throttle_floor : 0), 0, 1);

      if (drivetrainSim.downShift) {
        engineSim.throttle = 0.8;
      } else if (drivetrainSim.shifting) {
        engineSim.throttle = 0;
      } else {
        const delta = clamp(targetThrottle - engineSim.throttle, -0.2, 0.2);
        engineSim.throttle = clamp(engineSim.throttle + delta, 0, 1);
      }

      // Overrun pops & bangs logic
      if (shortCrackles.length && cfg.popAndBang) {
        const rpmNorm = norm(engineSim.rpm, popWindow[0], maxLimiterRpm);
        heat = clamp(heat + (engineSim.throttle * (0.3 + 0.7 * rpmNorm) / 6) * dt - dt / 40, 0, 1);

        if (targetThrottle >= 0.6) readyForPop = true;
        if (readyForPop && targetThrottle <= 0.15 && !drivetrainSim.shifting) {
          readyForPop = false;
          if (
            heat >= 0.2 &&
            engineSim.rpm >= popWindow[0] &&
            engineSim.rpm <= popWindow[1] &&
            nowMs - lastPopTime >= 400 &&
            Math.random() < clamp(0.25 + heat, 0, 0.95)
          ) {
            lastPopTime = nowMs;
            triggerPop(engineSim.rpm);
          }
        }
      }

      // Automatic gear shifting based on vehicle speed
      const isManual = customRev !== null;
      if (isManual) {
        drivetrainSim.gear = 2;
        drivetrainSim.downShift = false;
      } else if (!drivetrainSim.shifting) {
        const minDriveGear = 3;
        const targetAudioGear = (targetGear && targetGear >= 1) ? Math.min(targetGear + 2, drivetrainSim.gears.length) : null;

        if (targetAudioGear && targetAudioGear !== drivetrainSim.gear && speedKmh >= 0.6) {
          drivetrainSim.changeGear(targetAudioGear);
        } else if (!targetAudioGear) {
          if (drivetrainSim.gear === 0 || drivetrainSim.gear < minDriveGear) {
            if (speedKmh > 1) drivetrainSim.gear = Math.max(calcTargetGear(speedKmh), minDriveGear);
          } else if (speedKmh < 0.6) {
            drivetrainSim.gear = 0;
          } else if (speedToRpm(drivetrainSim.gear, speedKmh) > upshiftThreshold(speedKmh) && drivetrainSim.gear < drivetrainSim.gears.length) {
            drivetrainSim.nextGear();
          } else if (speedToRpm(drivetrainSim.gear, speedKmh) < downshiftThreshold(speedKmh) && drivetrainSim.gear > minDriveGear) {
            drivetrainSim.prevGear();
          }
        }
      }

      // Master volume ramping
      const accelNorm = clamp(accelOrEffort / 2.5, 0, 1);
      const decelNorm = clamp(-accelOrEffort / 2.5, 0, 1);
      const effortCombined = clamp(accelNorm + decelNorm * 0.72, 0, 1);
      const speedNorm = clamp(speedKmh / 115, 0, 1);
      const activityLevel = clamp(Math.max(speedNorm, effortCombined, isThrottle ? 0.8 : 0), 0, 1);
      const targetVolume = clamp(outputGain * lerp(0.18, 0.97, activityLevel) * 3.2, 0, 2.0);

      const smoothTime = targetVolume > currentTargetGain ? 0.012 : 0.09;
      currentTargetGain = targetVolume;
      masterGain.gain.setTargetAtTime(targetVolume, ctx.currentTime, smoothTime);

      // Physics integration (20 substeps for high accuracy)
      const substeps = 20;
      const subDt = dt / substeps;
      const targetOmega = speedToRpm(drivetrainSim.gear, speedKmh) / Se;

      for (let s = 0; s < substeps; s++) {
        engineSim.integrate(0, nowMs + dt * 1000 * (s / substeps), subDt);
        if (drivetrainSim.gear > 0) {
          drivetrainSim.prevTheta = drivetrainSim.theta;
          drivetrainSim.omega = targetOmega;
          drivetrainSim.theta += drivetrainSim.omega * subDt;
          engineSim.solvePos(drivetrainSim, subDt);
          engineSim.update(subDt);
          engineSim.solveVel(drivetrainSim, subDt);
        } else {
          drivetrainSim.integrate(subDt);
          engineSim.solvePos(drivetrainSim, subDt);
          drivetrainSim.solvePos(engineSim, subDt);
          engineSim.update(subDt);
          drivetrainSim.update(subDt);
          engineSim.solveVel(drivetrainSim, subDt);
          drivetrainSim.solveVel(engineSim, subDt);
        }
      }

      // Apply audio buffer gains and detune with direct RPM synchronization
      if (customRev !== null && customRev >= 0) {
        const rev = clamp(customRev, 0, 1);
        const overRev = clamp((customRev - 1) / 0.12, 0, 1);
        const lfo = 0.5 - 0.5 * Math.sin((nowMs / 1000) * Math.PI * 2 * 6.5);
        const b = (engineSim.idle + rev * (engineSim.limiter - engineSim.idle) - overRev * lfo * 600) / Se;
        engineSim.omega = b;
        engineSim.rpm = b * Se;
      }

      engineSim.applySounds(soundNodes, 1);

      // Apply character layer gains
      if (characterNodes.length) {
        const charWindow = cfg.character?.window ?? [3000, 5500];
        const charNorm = clamp((engineSim.rpm - charWindow[0]) / Math.max(1, charWindow[1] - charWindow[0]), 0, 1);
        const { gain1: r, gain2: i } = crossfadeGains(engineSim.throttle, 0, 1);
        characterNodes.forEach((node) => {
          node.gain.gain.value = charNorm * (node.isOn ? r : i) * node.volume;
        });
      }
    },
    fadeOutAndDispose: (fadeDurationMs = 40) => {
      let isDisposed = false;
      const doDispose = () => {
        if (isDisposed) return;
        isDisposed = true;
        for (const node of Object.values(soundNodes)) {
          try {
            node.audio.stop(0);
            node.audio.disconnect();
            node.gain.disconnect();
          } catch {}
        }
        for (const charNode of characterNodes) {
          try {
            charNode.audio.stop(0);
            charNode.audio.disconnect();
            charNode.gain.disconnect();
          } catch {}
        }
        try {
          if (activePop?.source) {
            activePop.source.stop(0);
            activePop.source.disconnect();
          }
        } catch {}
        try {
          engineBus.disconnect();
          masterGain.disconnect();
          compressor.disconnect();
          ctx.close().catch(() => {});
        } catch {}
      };

      try {
        const now = ctx.currentTime;
        const fadeSec = Math.max(0.005, fadeDurationMs / 1000);
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0, now + fadeSec);

        engineBus.gain.cancelScheduledValues(now);
        engineBus.gain.setValueAtTime(engineBus.gain.value, now);
        engineBus.gain.linearRampToValueAtTime(0, now + fadeSec);

        // Instantly mute idle sound loop so there is zero idle bleed
        if (soundNodes.idle?.gain?.gain) {
          soundNodes.idle.gain.gain.cancelScheduledValues(now);
          soundNodes.idle.gain.gain.setValueAtTime(0, now);
        }
      } catch {}

      if (fadeDurationMs <= 0) {
        doDispose();
      } else {
        setTimeout(doDispose, fadeDurationMs + 20);
      }
    },
    dispose: () => {
      let isDisposed = false;
      for (const node of Object.values(soundNodes)) {
        try {
          node.audio.stop(0);
          node.audio.disconnect();
          node.gain.disconnect();
        } catch {}
      }
      for (const charNode of characterNodes) {
        try {
          charNode.audio.stop(0);
          charNode.audio.disconnect();
          charNode.gain.disconnect();
        } catch {}
      }
      try {
        if (activePop?.source) {
          activePop.source.stop(0);
          activePop.source.disconnect();
        }
      } catch {}
      try {
        engineBus.disconnect();
        masterGain.disconnect();
        compressor.disconnect();
        ctx.close().catch(() => {});
      } catch {}
    }
  };
}

// 2. Synthesizer Engine Instance
function createSynthEngine(preset, muffleAmount = 0) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx({ latencyHint: 'interactive' });
  ctx.resume();

  const oscGain = ctx.createGain();
  const synthBus = ctx.createGain();
  const bodyBus = ctx.createGain();
  const lopeGain = ctx.createGain();
  const mixBus = ctx.createGain();

  const waveShaper = ctx.createWaveShaper();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const mainFilter = ctx.createBiquadFilter();
  const warmthFilter = ctx.createBiquadFilter();
  const sheenFilter = ctx.createBiquadFilter();
  const highpassFilter = ctx.createBiquadFilter();

  const masterGain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const ceiling = ctx.createWaveShaper();
  const muffle = createMuffleFilter(ctx, muffleAmount);

  // Noise and Intake
  const noiseSource = ctx.createBufferSource();
  const noiseFilter = ctx.createBiquadFilter();
  const noiseGain = ctx.createGain();

  const intakeSource = ctx.createBufferSource();
  const intakeFilter = ctx.createBiquadFilter();
  const intakeGain = ctx.createGain();

  // Turbo Spool
  const spoolFilter = ctx.createBiquadFilter();
  const spoolGain = ctx.createGain();

  // Sub bass
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();

  // Lope LFO
  const lopeOsc = ctx.createOscillator();
  const lopeDepth = ctx.createGain();

  // Direct level gain
  const directGain = ctx.createGain();

  // Dedicated high-frequency Inverter Carrier (for isElectric presets like Plaid)
  const inverterOsc = preset.isElectric ? ctx.createOscillator() : null;
  const inverterGain = preset.isElectric ? ctx.createGain() : null;
  const inverterFilter = preset.isElectric ? ctx.createBiquadFilter() : null;

  if (inverterOsc && inverterGain && inverterFilter) {
    inverterOsc.type = 'sine';
    inverterOsc.frequency.value = (preset.idleFrequency ?? 68) * 8;
    inverterFilter.type = 'highpass';
    inverterFilter.frequency.value = 1000;
    inverterGain.gain.value = 0;

    inverterOsc.connect(inverterFilter);
    inverterFilter.connect(inverterGain);
    inverterGain.connect(synthBus);
    inverterOsc.start();
  }

  // Setup initial node parameters
  oscGain.gain.value = 1 / Math.max(1, preset.stack ?? 3);
  mixBus.gain.value = 0.62;
  directGain.gain.value = preset.directLevel ?? 0.2;

  waveShaper.oversample = '4x';
  waveShaper.curve = makeTanhCurve(0.34);
  wetGain.gain.value = preset.driveFloor ?? 0.08;
  dryGain.gain.value = 1 - (preset.driveFloor ?? 0.08);

  mainFilter.type = 'lowpass';
  mainFilter.frequency.value = preset.filterFloor ?? 500;
  mainFilter.Q.value = preset.filterResonance ?? 1;

  warmthFilter.type = 'lowshelf';
  warmthFilter.frequency.value = 180;
  warmthFilter.gain.value = -1.5;

  sheenFilter.type = 'highshelf';
  sheenFilter.frequency.value = 2000;
  sheenFilter.gain.value = -2;

  highpassFilter.type = 'highpass';
  highpassFilter.frequency.value = 45;
  highpassFilter.Q.value = 0.7;

  compressor.threshold.value = -1.5;
  compressor.knee.value = 3;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;

  ceiling.oversample = '4x';
  ceiling.curve = makeCeilingCurve();

  // LFO
  lopeOsc.type = 'sine';
  lopeOsc.frequency.value = preset.lopeHz ?? 4.5;
  lopeDepth.gain.value = 0;
  lopeOsc.connect(lopeDepth);
  lopeDepth.connect(lopeGain.gain);

  // Spool
  spoolFilter.type = 'bandpass';
  spoolFilter.frequency.value = (preset.idleFrequency ?? 34) * (preset.spoolRatio ?? 2);
  spoolFilter.Q.value = preset.spoolQ ?? 4;
  spoolGain.gain.value = 0;
  oscGain.connect(spoolFilter);
  spoolFilter.connect(spoolGain);
  spoolGain.connect(bodyBus);

  // Noise
  const noiseBuf = createNoiseBuffer(ctx);
  noiseSource.buffer = noiseBuf;
  noiseSource.loop = true;
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = preset.noiseFrequency ?? 560;
  noiseFilter.Q.value = preset.noiseBandwidth ?? 0.9;
  noiseGain.gain.value = 0;
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(synthBus);

  // Intake
  intakeSource.buffer = noiseBuf;
  intakeSource.loop = true;
  intakeFilter.type = 'bandpass';
  intakeFilter.frequency.value = preset.intakeFrequency ?? 1500;
  intakeFilter.Q.value = 0.7;
  intakeGain.gain.value = 0;
  intakeSource.connect(intakeFilter);
  intakeFilter.connect(intakeGain);
  intakeGain.connect(synthBus);

  // Sub
  subOsc.type = 'sine';
  subOsc.frequency.value = (preset.idleFrequency ?? 34) / 2;
  subGain.gain.value = (preset.subLevel ?? 0.6) * 0.24;
  subOsc.connect(subGain);
  subGain.connect(synthBus);

  // Formants
  const formantNodes = (preset.formants ?? [100, 260, 620]).map((freq, idx) => {
    const fNode = ctx.createBiquadFilter();
    const gNode = ctx.createGain();
    fNode.type = 'bandpass';
    fNode.frequency.value = freq;
    fNode.Q.value = preset.formantQ ?? 4;
    gNode.gain.value = preset.formantLevels?.[idx] ?? 0.5;
    oscGain.connect(fNode);
    fNode.connect(gNode);
    gNode.connect(bodyBus);
    return fNode;
  });

  // Oscillators Stack
  const oscCount = preset.stack ?? 3;
  const oscillators = Array.from({ length: oscCount }, (_, idx) => {
    const osc = ctx.createOscillator();
    const detuneSpread = oscCount > 1 ? idx / (oscCount - 1) - 0.5 : 0;
    osc.type = preset.waveform ?? 'sawtooth';
    osc.frequency.value = preset.idleFrequency ?? 34;
    osc.detune.value = detuneSpread * (preset.detune ?? 12) * 2;
    osc.connect(oscGain);
    osc.start();
    return osc;
  });

  // Direct connection
  oscGain.connect(directGain);
  directGain.connect(bodyBus);
  bodyBus.connect(lopeGain);
  lopeGain.connect(synthBus);

  // Pipeline connections
  synthBus.connect(mixBus);
  mixBus.connect(dryGain);
  dryGain.connect(mainFilter);
  mixBus.connect(waveShaper);
  waveShaper.connect(wetGain);
  wetGain.connect(mainFilter);

  mainFilter.connect(warmthFilter);
  warmthFilter.connect(sheenFilter);
  sheenFilter.connect(highpassFilter);
  highpassFilter.connect(masterGain);

  masterGain.connect(muffle.node);
  muffle.node.connect(compressor);
  compressor.connect(ceiling);
  ceiling.connect(ctx.destination);

  // Start continuous nodes
  subOsc.start();
  noiseSource.start();
  intakeSource.start();
  lopeOsc.start();

  let masterGainVal = 0;
  const bornAt = ctx.currentTime;

  return {
    context: ctx,
    setMuffle: muffle.set,
    update: (isThrottle, outputGain, speedKmh, accelOrEffort, revRatio = 0) => {
      const now = ctx.currentTime;
      const rev = clamp(revRatio, 0, 1);
      const accelNorm = clamp(accelOrEffort / 2.5, 0, 1);
      const decelNorm = clamp(-accelOrEffort / 2.5, 0, 1);
      const dynamicEffort = Math.pow(clamp(accelNorm + decelNorm * 0.72, 0, 1), 1);

      // Pitch calculation
      const targetPitch = lerp(preset.idleFrequency, preset.redlineFrequency, rev) * 1.18;
      oscillators.forEach((osc) => {
        osc.frequency.setTargetAtTime(targetPitch, now, 0.004);
      });
      subOsc.frequency.setTargetAtTime(targetPitch / 2, now, 0.004);

      // High Inverter Carrier Whine (for electric drivetrains)
      if (inverterOsc && inverterGain) {
        const invFreq = lerp(1200, 5200, rev);
        inverterOsc.frequency.setTargetAtTime(invFreq, now, 0.006);
        const invVol = (preset.isElectric ? 0.42 : 0.2) * (0.05 + rev * 0.95) * (0.85 + accelNorm * 0.25);
        inverterGain.gain.setTargetAtTime(invVol, now, 0.02);
      }

      // Formants modulation - stable at constant speed
      formantNodes.forEach((fNode, idx) => {
        const baseFreq = preset.formants?.[idx] ?? 200;
        const formantMod = preset.isElectric ? rev * 0.35 + accelNorm * 0.1 : dynamicEffort * 0.22;
        fNode.frequency.setTargetAtTime(baseFreq * (1 + formantMod), now, 0.03);
      });

      // Lope LFO depth
      const lopeD = (preset.lopeDepth ?? 0.4) * 0.3 * (1 - rev * 0.75);
      const lopeF = (preset.lopeHz ?? 4.5) * (1 + rev * 1.37);
      lopeOsc.frequency.setTargetAtTime(lopeF, now, 0.02);
      lopeDepth.gain.setTargetAtTime(lopeD / 2, now, 0.03);

      // Spool
      spoolFilter.frequency.setTargetAtTime(targetPitch * (preset.spoolRatio ?? 2), now, 0.004);
      spoolGain.gain.setTargetAtTime((preset.spoolLevel ?? 0.2) * lerp(0.06, 1, rev), now, 0.02);

      // Filter cutoff - wide open for inverter whine, stable at constant speed
      const filterCutoff = preset.isElectric
        ? lerp(preset.filterFloor ?? 650, preset.filterCeiling ?? 4800, clamp(rev * 0.85 + accelNorm * 0.2, 0, 1))
        : lerp(
            preset.filterFloor ?? 400,
            (preset.filterCeiling ?? 2500) * 1.05,
            clamp(rev * 0.5 + accelNorm * 0.86, 0, 1)
          );
      mainFilter.frequency.setTargetAtTime(filterCutoff, now, 0.02);

      // Noise & intake
      const noiseAmp = (preset.noiseLevel ?? 0.15) * (0.08 + rev * 0.12 + accelNorm * 0.5);
      noiseGain.gain.setTargetAtTime(noiseAmp * 0.5, now, 0.02);
      intakeGain.gain.setTargetAtTime((preset.intakeLevel ?? 0.2) * 0.5 * (0.05 + dynamicEffort * 0.95), now, 0.02);

      // Master output volume - constant and steady at cruising speed
      const speedNorm = clamp(speedKmh / 115, 0, 1);
      const activity = preset.isElectric
        ? clamp(Math.max(speedNorm * 0.88, rev * 0.85) + (isThrottle ? 0.2 : 0) + accelNorm * 0.15, 0.2, 1)
        : clamp(Math.max(speedNorm, dynamicEffort, isThrottle ? 0.8 : 0), 0, 1);
      const targetVolume = outputGain * (preset.isElectric ? lerp(0.25, 1.35, activity) : lerp(0.18, 1.55, activity));
      const smooth = targetVolume > masterGainVal ? 0.012 : 0.09;
      masterGainVal = targetVolume;
      masterGain.gain.setTargetAtTime(targetVolume, now, smooth);

      // Wet / Dry distortion
      const wetLevel = lerp(preset.driveFloor ?? 0.08, preset.driveCeiling ?? 0.35, clamp(accelNorm * 0.9 + rev * 0.1, 0, 1));
      wetGain.gain.setTargetAtTime(wetLevel, now, 0.03);
      dryGain.gain.setTargetAtTime(1 - wetLevel, now, 0.03);
    },
    getTelemetry: () => ({
      rpm: Math.round(lerp(preset.idleFrequency * 20 || 800, preset.redlineFrequency * 20 || 8500, 0.2)),
      gear: 1,
      throttle: 0,
      isShifting: false
    }),
    fadeIn: () => {
      masterGainVal = 0;
      try {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
      } catch {}
    },
    fadeOutAndDispose: (fadeDurationMs = 40) => {
      let isDisposed = false;
      const doDispose = () => {
        if (isDisposed) return;
        isDisposed = true;
        oscillators.forEach((osc) => {
          try {
            osc.stop(0);
            osc.disconnect();
          } catch {}
        });
        try {
          if (inverterOsc) {
            inverterOsc.stop(0);
            inverterOsc.disconnect();
            inverterFilter?.disconnect();
            inverterGain?.disconnect();
          }
          subOsc.stop(0);
          subOsc.disconnect();
          noiseSource.stop(0);
          noiseSource.disconnect();
          intakeSource.stop(0);
          intakeSource.disconnect();
          lopeOsc.stop(0);
          lopeOsc.disconnect();
          masterGain.disconnect();
          ctx.close().catch(() => {});
        } catch {}
      };

      try {
        const now = ctx.currentTime;
        const fadeSec = Math.max(0.005, fadeDurationMs / 1000);
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0, now + fadeSec);
        mixBus.gain.cancelScheduledValues(now);
        mixBus.gain.setValueAtTime(0, now);
      } catch {}

      if (fadeDurationMs <= 0) {
        doDispose();
      } else {
        setTimeout(doDispose, fadeDurationMs + 20);
      }
    },
    dispose: () => {
      oscillators.forEach((osc) => {
        try {
          osc.stop(0);
          osc.disconnect();
        } catch {}
      });
      try {
        subOsc.stop(0);
        subOsc.disconnect();
        noiseSource.stop(0);
        noiseSource.disconnect();
        intakeSource.stop(0);
        intakeSource.disconnect();
        lopeOsc.stop(0);
        lopeOsc.disconnect();
        masterGain.disconnect();
        ctx.close().catch(() => {});
      } catch {}
    }
  };
}

// 3. Motion-Reactive Rain Ambience Synthesizer
class RainAmbienceSynthesizer {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.roofFilter = null;
    this.roofGain = null;
    this.strikeFilter = null;
    this.strikeGain = null;
    this.sprayFilter = null;
    this.sprayGain = null;
    this.noiseSource = null;
    this.noiseBuffer = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.7;
    this.speedKmh = 0;
    this.acceleration = 0;
    this.throttle = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    // Generate 4-second pink noise buffer (1/f natural raindrops acoustic curve)
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
      b6 = white * 0.115926;
    }
    this.noiseBuffer = buffer;

    // Master Output Bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.ratio.value = 8;
    this.masterGain.connect(compressor);
    compressor.connect(this.ctx.destination);

    // 1. Roof Rain Patter (continuous warm cabin base)
    this.roofFilter = this.ctx.createBiquadFilter();
    this.roofFilter.type = 'bandpass';
    this.roofFilter.frequency.value = 1600;
    this.roofFilter.Q.value = 1.0;

    this.roofGain = this.ctx.createGain();
    this.roofGain.gain.value = 0.22;
    this.roofFilter.connect(this.roofGain);
    this.roofGain.connect(this.masterGain);

    // 2. Windshield Droplet Strikes (high frequency crisp impacts on glass)
    this.strikeFilter = this.ctx.createBiquadFilter();
    this.strikeFilter.type = 'highpass';
    this.strikeFilter.frequency.value = 3400;
    this.strikeFilter.Q.value = 2.0;

    this.strikeGain = this.ctx.createGain();
    this.strikeGain.gain.value = 0.08;
    this.strikeFilter.connect(this.strikeGain);
    this.strikeGain.connect(this.masterGain);

    // 3. Wet-Road Tire Spray Whoosh (motion & acceleration reactive)
    this.sprayFilter = this.ctx.createBiquadFilter();
    this.sprayFilter.type = 'lowpass';
    this.sprayFilter.frequency.value = 380;
    this.sprayFilter.Q.value = 1.6;

    this.sprayGain = this.ctx.createGain();
    this.sprayGain.gain.value = 0; // Silent at 0 km/h!
    this.sprayFilter.connect(this.sprayGain);
    this.sprayGain.connect(this.masterGain);
  }

  start() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.isPlaying && this.noiseBuffer) {
      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = this.noiseBuffer;
      this.noiseSource.loop = true;

      this.noiseSource.connect(this.roofFilter);
      this.noiseSource.connect(this.strikeFilter);
      this.noiseSource.connect(this.sprayFilter);

      this.noiseSource.start(0);
      this.isPlaying = true;
    }

    const t = this.ctx.currentTime;
    const targetGain = this.isMuted ? 0 : this.volume * 0.75;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(targetGain, t, 0.15);
  }

  stop() {
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(0, t, 0.1);

    setTimeout(() => {
      if (!this.isPlaying) return;
      try {
        if (this.noiseSource) {
          this.noiseSource.stop();
          this.noiseSource.disconnect();
          this.noiseSource = null;
        }
      } catch {}
      this.isPlaying = false;
    }, 200);
  }

  setVolume(vol) {
    this.volume = clamp(vol, 0, 1);
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;
    const targetGain = this.isMuted ? 0 : this.volume * 0.75;
    this.masterGain.gain.setTargetAtTime(targetGain, t, 0.08);
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;
    const targetGain = this.isMuted ? 0 : this.volume * 0.75;
    this.masterGain.gain.setTargetAtTime(targetGain, t, 0.05);
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  update({ speedKmh = 0, acceleration = 0, throttle = 0 }) {
    if (!this.ctx || !this.isPlaying) return;
    const t = this.ctx.currentTime;

    const speedNorm = Math.min(speedKmh / 140, 1.8);
    const accelNorm = Math.max(0, acceleration / 4) + Math.max(0, throttle) * 0.35;

    // 1. Wet tire spray whoosh: silent at stop, swells dynamically with speed + acceleration
    const targetSprayFreq = 350 + speedNorm * 1850 + accelNorm * 380;
    const targetSprayGain = Math.min(0.45, speedNorm * 0.32 + accelNorm * 0.12);

    this.sprayFilter.frequency.setTargetAtTime(targetSprayFreq, t, 0.08);
    this.sprayGain.gain.setTargetAtTime(targetSprayGain, t, 0.08);

    // 2. Windshield droplet strike intensity: strikes increase as car rushes forward into rain
    const targetStrikeGain = 0.08 + speedNorm * 0.28 + (accelNorm > 0.1 ? 0.06 : 0);
    const targetStrikeFreq = 3400 + speedNorm * 1200;
    this.strikeFilter.frequency.setTargetAtTime(targetStrikeFreq, t, 0.08);
    this.strikeGain.gain.setTargetAtTime(targetStrikeGain, t, 0.08);

    // 3. Roof patter: slight acoustic opening with vehicle forward rush
    const targetRoofFreq = 1600 + speedNorm * 500;
    this.roofFilter.frequency.setTargetAtTime(targetRoofFreq, t, 0.1);
  }
}

// 4. Central Engine Audio Controller
class EngineAudioController {
  constructor() {
    this.currentVoiceId = null;
    this.activeEngine = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.outputGain = 0.85;
    this.transitionSeq = 0;
    this.isLoading = false;

    // Rain ambience
    this.rainSynth = null;
    this.rainActive = false;
    this.ambientGain = 0.7;

    // Thunder effect for Chill screen
    this.thunderTimer = null;
    this.activeThunderAudio = null;
    this.isThunderActive = false;
  }

  async setPreset(voiceId) {
    if (this.currentVoiceId === voiceId && (this.activeEngine || this.isLoading)) return;
    this.currentVoiceId = voiceId;

    if (this.isPlaying) {
      await this.start(voiceId);
    }
  }

  async start(voiceId = this.currentVoiceId) {
    this.currentVoiceId = voiceId;
    const currentSeq = ++this.transitionSeq;
    this.isLoading = true;

    // Instantly fade out and dispose old engine so idling sound NEVER bleeds over
    if (this.activeEngine) {
      const old = this.activeEngine;
      this.activeEngine = null;
      if (typeof old.fadeOutAndDispose === 'function') {
        old.fadeOutAndDispose(40);
      } else if (typeof old.dispose === 'function') {
        old.dispose();
      }
    }

    const procarKey = getProcarKey(voiceId);
    let newEngine = null;

    if (procarKey) {
      newEngine = await createProcarEngine(procarKey, 0);
    } else {
      const synthPreset = SYNTH_PRESETS[voiceId] ?? SYNTH_PRESETS['apex-v8'];
      newEngine = createSynthEngine(synthPreset, 0);
    }

    // Sequence check: if another preset was chosen while newEngine was loading, discard it
    if (this.transitionSeq !== currentSeq) {
      if (newEngine) {
        if (typeof newEngine.fadeOutAndDispose === 'function') {
          newEngine.fadeOutAndDispose(0);
        } else if (typeof newEngine.dispose === 'function') {
          newEngine.dispose();
        }
      }
      return;
    }

    this.activeEngine = newEngine;
    this.isLoading = false;
    this.isPlaying = true;

    if (this.activeEngine && typeof this.activeEngine.fadeIn === 'function') {
      this.activeEngine.fadeIn();
    }
  }

  stopCurrentEngine() {
    this.transitionSeq++;
    this.isLoading = false;
    if (this.activeEngine) {
      const engine = this.activeEngine;
      this.activeEngine = null;
      if (typeof engine.fadeOutAndDispose === 'function') {
        engine.fadeOutAndDispose(40);
      } else if (typeof engine.dispose === 'function') {
        engine.dispose();
      }
    }
  }

  stop() {
    this.isPlaying = false;
    this.stopCurrentEngine();
  }

  resume() {
    if (this.activeEngine?.context?.state === 'suspended') {
      this.activeEngine.context.resume().catch(() => {});
    }
    if (this.rainSynth) {
      this.rainSynth.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.rainSynth) {
      this.rainSynth.setMuted(muted);
    }
    if (this.activeThunderAudio) {
      this.activeThunderAudio.muted = muted;
    }
  }

  setMasterVolume(val) {
    this.outputGain = clamp(val, 0, 1);
  }

  setEngineVolume(val) {
    this.outputGain = clamp(val, 0, 1);
  }

  setAmbientVolume(val) {
    this.ambientGain = clamp(val, 0, 1);
    if (this.rainSynth) {
      this.rainSynth.setVolume(this.ambientGain);
    }
    if (this.activeThunderAudio) {
      this.activeThunderAudio.volume = clamp(this.ambientGain * 0.9, 0, 1);
    }
  }

  getTelemetry() {
    if (this.activeEngine?.getTelemetry) {
      return this.activeEngine.getTelemetry();
    }
    return {
      rpm: 800,
      gear: 1,
      throttle: 0,
      isShifting: false,
      heat: 0
    };
  }

  update({ rpm = 1000, speedKmh = 0, acceleration = 0, throttle = 0, isThrottleDown = false, isShifting = false, redlineRpm = 9000, gear = 1, customRev = null }) {
    // Forward motion state to rain synthesizer
    if (this.rainActive && this.rainSynth) {
      this.rainSynth.update({ speedKmh, acceleration, throttle });
    }

    if (!this.isPlaying || !this.activeEngine) return;

    const gain = this.isMuted ? 0 : this.outputGain;
    const isDown = isThrottleDown || throttle > 0.05;

    // Only pass customRev when stationary revving (speed < 0.6 and throttle is down) or explicitly provided
    let revArg = customRev;
    if (revArg === null && speedKmh < 0.6 && isDown) {
      revArg = throttle > 0 ? throttle : 0.8;
    } else if (revArg === null && !getProcarKey(this.currentVoiceId)) {
      // For synth engines: pass normalized rev ratio so synth pitch accurately tracks RPM in every gear
      const activePreset = SYNTH_PRESETS[this.currentVoiceId];
      const baseIdle = activePreset?.isElectric ? 500 : 800;
      revArg = Math.max(0, Math.min(1, (rpm - baseIdle) / Math.max(1, redlineRpm - baseIdle)));
    }

    this.activeEngine.update(
      isDown,
      gain,
      speedKmh,
      acceleration,
      revArg,
      gear
    );
  }

  startRainAmbience() {
    this.rainActive = true;
    if (!this.rainSynth) {
      this.rainSynth = new RainAmbienceSynthesizer();
    }
    this.rainSynth.setVolume(this.ambientGain);
    this.rainSynth.setMuted(this.isMuted);
    this.rainSynth.start();
  }

  stopRainAmbience() {
    this.rainActive = false;
    if (this.rainSynth) {
      this.rainSynth.stop();
    }
  }

  startThunderScheduler() {
    this.isThunderActive = true;
    if (this.thunderTimer) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
    this.scheduleNextThunder();
  }

  stopThunderScheduler() {
    this.isThunderActive = false;
    if (this.thunderTimer) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
    if (this.activeThunderAudio) {
      try {
        this.activeThunderAudio.pause();
        this.activeThunderAudio.currentTime = 0;
      } catch {}
      this.activeThunderAudio = null;
    }
  }

  scheduleNextThunder() {
    if (!this.isThunderActive) return;
    // Random interval between 1 minute (60,000 ms) and 10 minutes (600,000 ms)
    const minMs = 60 * 1000;
    const maxMs = 600 * 1000;
    const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));

    this.thunderTimer = setTimeout(() => {
      if (this.isThunderActive) {
        this.playThunder();
        this.scheduleNextThunder();
      }
    }, delay);
  }

  playThunder() {
    if (this.isMuted) return;
    try {
      if (this.activeThunderAudio) {
        try {
          this.activeThunderAudio.pause();
        } catch {}
      }
      const audio = new Audio('/audio/halloween/thunder.mp3');
      audio.volume = clamp(this.ambientGain * 0.9, 0, 1);
      audio.muted = this.isMuted;
      audio.play().catch((e) => console.debug('Thunder audio play notice:', e));
      this.activeThunderAudio = audio;
      audio.onended = () => {
        if (this.activeThunderAudio === audio) {
          this.activeThunderAudio = null;
        }
      };
    } catch (e) {
      console.debug('Thunder audio error:', e);
    }
  }
}

export const engineAudio = new EngineAudioController();

if (typeof window !== 'undefined') {
  window.__playThunder = () => engineAudio.playThunder();
}
