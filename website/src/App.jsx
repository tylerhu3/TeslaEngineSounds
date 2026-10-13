import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import CanvasStage from './components/CanvasStage';
import HUD from './components/HUD';
import SimulatorPedal from './components/SimulatorPedal';
import DockDrawer from './components/DockDrawer';
import SettingsModal from './components/SettingsModal';
import LofiPlayer from './components/LofiPlayer';
import LockedPreviewModal from './components/LockedPreviewModal';
import { SCENES } from './data/scenes';
import { VehiclePhysics } from './engine/physicsEngine';
import { engineAudio } from './engine/audioEngine';
import { enableBackgroundAudioKeepAlive, createBackgroundTicker } from './engine/backgroundAudio';

export default function App() {
  // 1. Scene & Vehicle State
  const [currentScene, setCurrentScene] = useState(SCENES[0]);
  const physicsRef = useRef(new VehiclePhysics(SCENES[0].specs));

  const [physicsState, setPhysicsState] = useState(() => physicsRef.current.getState());

  // 2. Localization
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem('plaid-mode:locale') || 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:locale', locale);
    } catch {}
  }, [locale]);

  // 3. Theme & Preferences
  const [themePreference, setThemePreference] = useState(() => {
    try {
      return localStorage.getItem('plaid-mode:themePref') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [theme, setTheme] = useState('dark');

  // Dynamic Theme resolution (Auto vs Light vs Dark)
  useEffect(() => {
    const applyTheme = () => {
      if (themePreference === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(isDark ? 'dark' : 'light');
      } else {
        setTheme(themePreference);
      }
    };

    applyTheme();
    try {
      localStorage.setItem('plaid-mode:themePref', themePreference);
    } catch {}

    if (themePreference === 'auto') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e) => setTheme(e.matches ? 'dark' : 'light');
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [themePreference]);

  // Sync Theme to HTML Element
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 4. Units & Display Preferences
  const [unit, setUnit] = useState(() => {
    try {
      return localStorage.getItem('plaid-mode:unit') || 'mph';
    } catch {
      return 'mph';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:unit', unit);
    } catch {}
  }, [unit]);

  // Hide Speedometer Readout Setting
  const [isReadoutHidden, setIsReadoutHidden] = useState(() => {
    try {
      return localStorage.getItem('plaid-mode:hideReadout') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:hideReadout', isReadoutHidden.toString());
    } catch {}
  }, [isReadoutHidden]);

  // Steering Wheel Position (Left vs Right)
  const [wheelSide, setWheelSide] = useState(() => {
    try {
      return localStorage.getItem('plaid-mode:wheelSide') || 'left';
    } catch {
      return 'left';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:wheelSide', wheelSide);
    } catch {}
  }, [wheelSide]);

  // 5. Audio Settings & Background Audio
  const [effectsVolume, setEffectsVolume] = useState(() => {
    try {
      const v = localStorage.getItem('plaid-mode:effectsVolume');
      return v !== null ? parseFloat(v) : 0.85;
    } catch {
      return 0.85;
    }
  });

  const [musicVolume, setMusicVolume] = useState(() => {
    try {
      const v = localStorage.getItem('plaid-mode:musicVolume');
      return v !== null ? parseFloat(v) : 0.7;
    } catch {
      return 0.7;
    }
  });

  const [isBackgroundAudio, setIsBackgroundAudio] = useState(() => {
    try {
      const saved = localStorage.getItem('plaid-mode:bgAudio');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:bgAudio', isBackgroundAudio.toString());
    } catch {}
  }, [isBackgroundAudio]);

  // Production environment check: Netlify, production domains, or non-localhost
  const isProduction =
    import.meta.env.PROD ||
    (typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1');

  // In production, always default to GPS speed measurement as driver effects & speed
  const [isGpsActive, setIsGpsActive] = useState(() => {
    try {
      const saved = localStorage.getItem('plaid-mode:gpsActive');
      if (saved !== null) return saved === 'true';
      return isProduction;
    } catch {
      return isProduction;
    }
  });

  // In production, simulation throttle pedal is off by default (vehicle motion drives it)
  const [isSimulated, setIsSimulated] = useState(() => {
    try {
      const saved = localStorage.getItem('plaid-mode:isSimulated');
      if (saved !== null) return saved === 'true';
      return !isProduction;
    } catch {
      return !isProduction;
    }
  });

  const [isMuted, setIsMuted] = useState(false);
  const [tremorAmount, setTremorAmount] = useState(0.5);

  // GPS Tracking Lifecycle & Persistent State
  useEffect(() => {
    if (isGpsActive) {
      physicsRef.current.startGpsTracking(
        () => setIsGpsActive(true),
        (err) => {
          console.warn('GPS location tracking error or permission denied:', err);
          // If permission is explicitly denied, keep app usable via simulation
          if (err && err.code === 1) {
            setIsGpsActive(false);
            setIsSimulated(true);
          }
        }
      );
    } else {
      physicsRef.current.stopGpsTracking();
    }

    try {
      localStorage.setItem('plaid-mode:gpsActive', isGpsActive.toString());
    } catch {}
  }, [isGpsActive]);

  useEffect(() => {
    try {
      localStorage.setItem('plaid-mode:isSimulated', isSimulated.toString());
    } catch {}
  }, [isSimulated]);

  // Background Audio Behavior:
  // 1. If background audio is OFF, lock manual mode and force Auto
  useEffect(() => {
    if (!isBackgroundAudio && physicsState.isManual) {
      physicsRef.current.toggleManual();
    }
  }, [isBackgroundAudio, physicsState.isManual]);

  // 2. Resume AudioContext and keep background playback alive on visibility changes
  useEffect(() => {
    const handleVisibility = () => {
      engineAudio.resume();
      if (!isBackgroundAudio) {
        if (document.hidden) {
          engineAudio.setMuted(true);
        } else if (!isMuted) {
          engineAudio.setMuted(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [isBackgroundAudio, isMuted]);

  // Volume Handlers
  const handleChangeEffectsVolume = useCallback((val) => {
    setEffectsVolume(val);
    engineAudio.setMasterVolume(val);
    try {
      localStorage.setItem('plaid-mode:effectsVolume', val.toString());
    } catch {}
  }, []);

  const handleChangeMusicVolume = useCallback((val) => {
    setMusicVolume(val);
    engineAudio.setAmbientVolume(val);
    try {
      localStorage.setItem('plaid-mode:musicVolume', val.toString());
    } catch {}
  }, []);

  // Packs Unlock State (All packs unlocked by default)
  const [unlockedPacks, setUnlockedPacks] = useState(() => {
    try {
      const saved = localStorage.getItem('plaid-mode:unlockedPacks');
      return saved ? JSON.parse(saved) : ['basic', 'v8', 'summer-2026'];
    } catch {
      return ['basic', 'v8', 'summer-2026'];
    }
  });

  // Preview Modal for locked items
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    packId: 'v8',
    scene: null
  });
  const isPreviewOpenRef = useRef(false);
  useEffect(() => {
    isPreviewOpenRef.current = previewState.isOpen;
  }, [previewState.isOpen]);

  // Modals & Panels
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLofiPlayerOpen, setIsLofiPlayerOpen] = useState(false);
  const [isLofiPlaying, setIsLofiPlaying] = useState(false);
  const [rainActive, setRainActive] = useState(true);

  // Scene Switch Handler
  const handleSelectScene = useCallback((scene) => {
    setCurrentScene(scene);
    physicsRef.current.updateSpecs(scene.specs);
    engineAudio.setPreset(scene.voiceId);

    // If scene has music or is rain
    if (scene.hasMusic || scene.scene === 'rain') {
      setIsLofiPlayerOpen(true);
      setIsLofiPlaying(true);
      if (rainActive) {
        engineAudio.startRainAmbience();
      }
    } else {
      setIsLofiPlayerOpen(false);
      setIsLofiPlaying(false);
      engineAudio.stopRainAmbience();
    }

    setIsDockOpen(false);
  }, [rainActive]);

  // Audio Engine Lifecycle & Interaction Listener
  useEffect(() => {
    engineAudio.setPreset(currentScene.voiceId);
    engineAudio.setMasterVolume(effectsVolume);

    const unlockAudio = () => {
      engineAudio.resume();
      enableBackgroundAudioKeepAlive();
      if (!engineAudio.isPlaying) {
        engineAudio.start();
      }
      if (currentScene.scene === 'rain' && rainActive) {
        engineAudio.startRainAmbience();
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [currentScene.voiceId, effectsVolume]);

  // 60FPS Physics & Audio Loop with unthrottled background ticker
  useEffect(() => {
    let animId;
    let lastTime = performance.now();

    const tickFrame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const p = physicsRef.current;
      if (!p) return;
      const state = p.tick(dt);

      // Feed engine audio parameters if preview modal is not active
      if (!isPreviewOpenRef.current) {
        engineAudio.update({
          speedKmh: state.speedKmh,
          acceleration: state.accelerationMs2,
          throttle: state.throttle,
          rpm: state.rpm,
          isLimiterBouncing: state.isLimiterBouncing,
          isShifting: state.isShifting,
          redlineRpm: state.redlineRpm,
          gear: state.gear
        });
      }

      setPhysicsState(state);
    };

    const loop = () => {
      tickFrame();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    // Background Web Worker ticker: keeps physics and engine audio ticking when
    // requestAnimationFrame is paused by the browser (hidden tab, locked screen, in-car navigation)
    const bgTicker = createBackgroundTicker(() => {
      if (document.hidden) {
        tickFrame();
      }
    });

    const handleVisibility = () => {
      lastTime = performance.now();
      engineAudio.resume();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      bgTicker.dispose();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Pack Unlock Handler
  const handleUnlockPack = useCallback((packId) => {
    setUnlockedPacks((prev) => {
      if (prev.includes(packId)) return prev;
      const next = [...prev, packId];
      try {
        localStorage.setItem('plaid-mode:unlockedPacks', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Open Preview Modal for locked scene / pack
  const handleOpenPreview = useCallback((pack, scene) => {
    setIsDockOpen(false);
    setPreviewState({
      isOpen: true,
      packId: pack.id,
      scene: scene
    });
  }, []);

  // Close Preview Modal & restore main scene audio
  const handleClosePreview = useCallback(() => {
    setPreviewState((prev) => ({ ...prev, isOpen: false }));
    engineAudio.setPreset(currentScene.voiceId);
  }, [currentScene.voiceId]);

  // Throttle Control
  const handleThrottleChange = useCallback((val) => {
    physicsRef.current.setThrottle(val);
    engineAudio.resume();
    if (!engineAudio.isPlaying) {
      engineAudio.start();
    }
  }, []);

  // Shifting Handlers
  const handleShiftUp = useCallback(() => {
    physicsRef.current.shiftUp();
  }, []);

  const handleShiftDown = useCallback(() => {
    physicsRef.current.shiftDown();
  }, []);

  const handleToggleManual = useCallback(() => {
    if (!isBackgroundAudio) {
      // Manual gearbox locked without background playback
      return;
    }
    physicsRef.current.toggleManual();
  }, [isBackgroundAudio]);

  // Audio Controls
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      engineAudio.setMuted(next);
      return next;
    });
  }, []);

  // Units
  const handleToggleUnit = useCallback(() => {
    setUnit((prev) => (prev === 'km/h' ? 'mph' : 'km/h'));
  }, []);

  // GPS Mode
  const handleToggleGps = useCallback(() => {
    setIsGpsActive((prev) => {
      const next = !prev;
      if (next) {
        setIsSimulated(false);
      }
      return next;
    });
  }, []);

  // Simulation Throttle Toggle
  const handleToggleSimulated = useCallback(() => {
    setIsSimulated((prev) => {
      const next = !prev;
      if (next) {
        setIsGpsActive(false);
      }
      return next;
    });
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      switch (e.key.toLowerCase()) {
        case 'g':
          handleToggleManual();
          break;
        case 'e':
          handleShiftUp();
          break;
        case 'q':
          handleShiftDown();
          break;
        case 'u':
          handleToggleUnit();
          break;
        case 'm':
          handleToggleMute();
          break;
        case 'd':
          setIsDockOpen((prev) => !prev);
          break;
        case 'escape':
          setIsDockOpen(false);
          setIsSettingsOpen(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleManual, handleShiftUp, handleShiftDown, handleToggleUnit, handleToggleMute]);

  return (
    <div className={`appShell ${wheelSide === 'right' ? 'appShell--wheelRight' : ''}`}>
      {/* 1. Top Navigation */}
      <Header
        theme={theme}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        unit={unit}
        onToggleUnit={handleToggleUnit}
        isGpsActive={isGpsActive}
        onToggleGps={handleToggleGps}
        scene={currentScene}
        isLofiPlayerOpen={isLofiPlayerOpen}
        onToggleLofiPlayer={() => setIsLofiPlayerOpen((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDockOpen={isDockOpen}
        onToggleDock={() => setIsDockOpen((prev) => !prev)}
        wheelSide={wheelSide}
        locale={locale}
      />

      {/* 2. Main Visual Stage */}
      <main
        className="stage"
        onPointerDown={(e) => {
          if (e.target.closest('button, .drawer, .modal, .headerBtn, .dockTab, .stageMode__switch, .settings, select, input')) return;
          handleThrottleChange(1.0);
        }}
        onPointerUp={() => handleThrottleChange(0.0)}
        onPointerCancel={() => handleThrottleChange(0.0)}
      >
        <CanvasStage
          scene={currentScene}
          speedKmh={physicsState.speedKmh}
          acceleration={physicsState.accelerationMs2}
          throttle={physicsState.throttle}
          shiftProgress={physicsState.shiftProgress}
          shiftWay={physicsState.shiftWay}
          tremorAmount={tremorAmount}
          rainActive={rainActive}
        />

        {/* 3. Automotive Cockpit HUD */}
        <HUD
          state={physicsState}
          scene={currentScene}
          unit={unit}
          onToggleUnit={handleToggleUnit}
          onToggleManual={handleToggleManual}
          onShiftUp={handleShiftUp}
          onShiftDown={handleShiftDown}
          isReadoutHidden={isReadoutHidden}
          isBackgroundAudio={isBackgroundAudio}
          locale={locale}
        />

        {/* 4. Left/Right Edge Soundscape Drawer Tab */}
        <button
          type="button"
          className={`dockTab ${isDockOpen ? 'dockTab--active' : ''} ${wheelSide === 'right' ? 'dockTab--isRight' : ''}`}
          onClick={() => setIsDockOpen((prev) => !prev)}
          aria-label="Toggle Soundscapes Drawer"
          title="Open Soundscapes"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={wheelSide === 'right' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
          </svg>
        </button>
      </main>

      {/* 4. Interactive Simulation Throttle Pedal */}
      {isSimulated && (
        <SimulatorPedal
          throttle={physicsState.throttle}
          onThrottleChange={handleThrottleChange}
          scene={currentScene}
        />
      )}

      {/* 5. Lo-fi Chill Player (Available for Lo-fi or anytime) */}
      {isLofiPlayerOpen && (
        <LofiPlayer
          isPlaying={isLofiPlaying}
          onTogglePlay={() => setIsLofiPlaying((prev) => !prev)}
          rainActive={rainActive}
          onToggleRain={() => {
            setRainActive((prev) => {
              const next = !prev;
              if (next) engineAudio.startRainAmbience();
              else engineAudio.stopRainAmbience();
              return next;
            });
          }}
        />
      )}

      {/* 6. Soundscapes Dock Drawer */}
      <DockDrawer
        isOpen={isDockOpen}
        onClose={() => setIsDockOpen(false)}
        currentScene={currentScene}
        onSelectScene={handleSelectScene}
        isSimulated={isSimulated}
        onToggleSimulated={handleToggleSimulated}
        unlockedPacks={unlockedPacks}
        onOpenPreview={handleOpenPreview}
        wheelSide={wheelSide}
      />

      {/* 7. Locked Sound Preview Modal */}
      <LockedPreviewModal
        isOpen={previewState.isOpen}
        onClose={handleClosePreview}
        initialScene={previewState.scene}
        packId={previewState.packId}
        unit={unit}
        onSelectScene={handleSelectScene}
      />

      {/* 8. Settings Modal (Full Dribe Parity) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        locale={locale}
        onSetLocale={setLocale}
        effectsVolume={effectsVolume}
        onChangeEffectsVolume={handleChangeEffectsVolume}
        musicVolume={musicVolume}
        onChangeMusicVolume={handleChangeMusicVolume}
        hasSelectedMusic={currentScene.hasMusic || isLofiPlayerOpen}
        isBackgroundAudio={isBackgroundAudio}
        onChangeBackgroundAudio={setIsBackgroundAudio}
        themePreference={themePreference}
        onSetThemePreference={setThemePreference}
        isReadoutHidden={isReadoutHidden}
        onChangeReadoutHidden={setIsReadoutHidden}
        wheelSide={wheelSide}
        onChangeWheelSide={setWheelSide}
        unit={unit}
        onSetUnit={setUnit}
        tremorAmount={tremorAmount}
        onSetTremor={setTremorAmount}
        isGpsActive={isGpsActive}
        onToggleGps={handleToggleGps}
      />
    </div>
  );
}
