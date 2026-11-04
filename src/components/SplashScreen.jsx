import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SPLASH_DURATION_MS,
  PROJECT_SPLASH_IDENTITY,
  SPLASH_SCENES,
  adaptSplashMetricsToProject,
  computeSplashTimelineState,
} from '../lib/splash-choreography.mjs';

function isExplicitCinemaRequest(initialCinemaMode = false) {
  if (initialCinemaMode) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search || '');
  return (
    params.get('splash') === 'cinema' ||
    window.location.hash === '#splash' ||
    Boolean(window.__SPLASH_NORMAL_BROWSER__)
  );
}

function isAutomatedWebDriverSession(initialCinemaMode = false) {
  if (isExplicitCinemaRequest(initialCinemaMode)) return false;
  return typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
}

export function SplashScreen({
  refNode,
  actualNode,
  comparison,
  readerStatus,
  preferredAiModel = 'gemini-flash-latest',
  initialCinemaMode = false,
  forceReducedMotion = null,
}) {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof forceReducedMotion === 'boolean') return forceReducedMotion;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('reducedMotion') === '1') return true;
    }
    return false;
  });

  const [elapsedMs, setElapsedMs] = useState(0);
  const [manualSceneNumber, setManualSceneNumber] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCinemaOverlay, setIsCinemaOverlay] = useState(() => {
    if (isExplicitCinemaRequest(initialCinemaMode)) return true;
    return !isAutomatedWebDriverSession(initialCinemaMode);
  });

  useEffect(() => {
    if (typeof forceReducedMotion === 'boolean') {
      setReducedMotion(forceReducedMotion);
    }
  }, [forceReducedMotion]);

  const timeline = useMemo(
    () =>
      computeSplashTimelineState(elapsedMs, {
        totalDurationMs: DEFAULT_SPLASH_DURATION_MS,
        reducedMotion,
        manualSceneNumber,
        skipped: isSkipped,
      }),
    [elapsedMs, reducedMotion, manualSceneNumber, isSkipped]
  );

  const telemetry = useMemo(
    () =>
      adaptSplashMetricsToProject({
        ref: refNode,
        actual: actualNode,
        comparison,
        readerStatus,
        preferredAiModel,
      }),
    [refNode, actualNode, comparison, readerStatus, preferredAiModel]
  );

  const hasReachedCompletion = elapsedMs >= DEFAULT_SPLASH_DURATION_MS;

  useEffect(() => {
    if (reducedMotion || isPaused || isSkipped || manualSceneNumber != null) return undefined;
    if (hasReachedCompletion) {
      if (isCinemaOverlay || !isAutomatedWebDriverSession(initialCinemaMode)) {
        const dockTimer = setTimeout(() => {
          setIsCinemaOverlay(false);
          setIsMinimized(true);
        }, 600);
        return () => clearTimeout(dockTimer);
      }
      return undefined;
    }

    let rafId = null;
    let lastTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const stepFrame = now => {
      const currentTimestamp = typeof now === 'number' ? now : Date.now();
      const deltaMs = Math.max(4, Math.min(100, currentTimestamp - lastTimestamp));
      lastTimestamp = currentTimestamp;

      setElapsedMs(prev => {
        const next = Math.round(prev + deltaMs);
        return next >= DEFAULT_SPLASH_DURATION_MS ? DEFAULT_SPLASH_DURATION_MS : next;
      });

      rafId = requestAnimationFrame(stepFrame);
    };

    rafId = requestAnimationFrame(stepFrame);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [reducedMotion, isPaused, isSkipped, manualSceneNumber, hasReachedCompletion, isCinemaOverlay, initialCinemaMode]);

  function handleSelectScene(sceneNum) {
    setIsMinimized(false);
    setIsSkipped(false);
    setManualSceneNumber(sceneNum);
    setIsPaused(true);
  }

  function handleReplaySplash() {
    setIsMinimized(false);
    setIsSkipped(false);
    setManualSceneNumber(null);
    setIsPaused(false);
    setElapsedMs(0);
  }

  function handleSkipSplash() {
    setManualSceneNumber(null);
    setIsSkipped(true);
    setIsCinemaOverlay(false);
    if (!isAutomatedWebDriverSession(initialCinemaMode)) {
      setIsMinimized(true);
    }
    setElapsedMs(DEFAULT_SPLASH_DURATION_MS);
  }

  function handleTogglePlayPause() {
    if (timeline.isCompleted || isSkipped) {
      handleReplaySplash();
      return;
    }
    if (manualSceneNumber != null) {
      const target = SPLASH_SCENES[manualSceneNumber - 1] || SPLASH_SCENES[0];
      setElapsedMs(Math.round(target.startRatio * DEFAULT_SPLASH_DURATION_MS));
      setManualSceneNumber(null);
      setIsPaused(false);
      return;
    }
    setIsPaused(prev => !prev);
  }

  const activeSceneNum = timeline.activeSceneNumber;
  const activeScene = timeline.activeScene;

  // Dynamic geometry values driven by active scene & continuous sceneProgress
  const isScene1 = activeSceneNum === 1;
  const isScene2 = activeSceneNum === 2;
  const isScene3 = activeSceneNum === 3;
  const isScene4 = activeSceneNum === 4;
  const isScene5 = activeSceneNum === 5;
  const syncFactor = activeSceneNum >= 4 ? 1 : isScene3 ? timeline.sceneProgress : 0;
  const liveFidelityScore =
    activeSceneNum >= 4
      ? 100
      : Math.round((telemetry.propertyScore + (100 - telemetry.propertyScore) * syncFactor) * 10) / 10;

  // Twenty-four property grid cells for Scene 3 progressive synchronization
  const propertyCells = useMemo(() => {
    const labels = [
      'W', 'H', 'X', 'Y', 'BG', 'BR', 'BW', 'BC',
      'TXT', 'FF', 'FS', 'FW', 'LH', 'TA', 'PT', 'PR',
      'PB', 'PL', 'GAP', 'DIR', 'PA', 'CA', 'OP', 'VIS',
    ];
    return labels.map((code, idx) => {
      const col = idx % 8;
      const row = Math.floor(idx / 8);
      const threshold = (idx + 1) / labels.length;
      const isSynced = activeSceneNum >= 4 || (isScene3 && Math.max(0.15, timeline.sceneProgress) >= threshold);
      return {
        code,
        x: 392 + col * 42,
        y: 286 + row * 22,
        color: isSynced ? '#10B981' : '#F59E0B',
      };
    });
  }, [activeSceneNum, isScene3, timeline.sceneProgress]);

  return (
    <section
      className={[
        'splash-motion-root',
        isCinemaOverlay ? 'is-cinema-overlay' : 'is-stage-embedded',
        isMinimized ? 'is-minimized' : 'is-expanded',
        `scene-active-${activeSceneNum}`,
      ].join(' ')}
      data-testid="project-splash-screen"
      data-splash-state={timeline.state}
      data-active-scene={String(activeSceneNum)}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-cinema-mode={isCinemaOverlay ? 'true' : 'false'}
      aria-label="عرض المقدمة الحركية لمحرك مطابقة تصميم Figma مع React"
    >
      {/* Top Control & Telemetry Strip */}
      <div className="splash-top-hud" data-testid="splash-top-hud">
        <div className="splash-hud-identity">
          <span className="splash-live-pill" data-testid="splash-active-scene-badge">
            <span className="splash-pulse-dot" />
            {activeScene.titleAr}
          </span>
          <span className="splash-hud-subtitle" data-testid="splash-active-scene-subtitle">
            {activeScene.subtitleAr}
          </span>
        </div>

        <div className="splash-hud-actions" data-testid="splash-controls">
          <button
            type="button"
            className="splash-ctrl-btn"
            data-testid="splash-play-pause-btn"
            onClick={handleTogglePlayPause}
          >
            {timeline.isCompleted || isSkipped
              ? '↻ تشغيل تلقائي'
              : isPaused || manualSceneNumber != null
                ? '▶ استئناف الحركة'
                : '⏸ إيقاف مؤقت'}
          </button>

          <button
            type="button"
            className="splash-ctrl-btn splash-ctrl-replay"
            data-testid="splash-replay-btn"
            onClick={handleReplaySplash}
          >
            🎬 إعادة العرض (Replay)
          </button>

          <button
            type="button"
            className="splash-ctrl-btn"
            data-testid="splash-cinema-toggle-btn"
            onClick={() => {
              setIsMinimized(false);
              setIsCinemaOverlay(prev => !prev);
            }}
          >
            {isCinemaOverlay ? '↙ وضع المسرح المدمج' : '⛶ ملء الشاشة السينمائي'}
          </button>

          <button
            type="button"
            className="splash-ctrl-btn"
            data-testid="splash-minimize-toggle-btn"
            onClick={() => setIsMinimized(prev => !prev)}
          >
            {isMinimized ? '▼ إظهار لوحة الموشن SVG' : '▲ طيّ اللوحة'}
          </button>

          <button
            type="button"
            className="splash-ctrl-btn splash-ctrl-skip"
            data-testid="splash-skip-btn"
            onClick={handleSkipSplash}
          >
            تخطي المقدمة ⏭
          </button>
        </div>
      </div>

      {/* Main SVG Motion Graphics Stage */}
      {!isMinimized && (
        <div className="splash-stage-viewport" data-testid="splash-stage-viewport">
          <svg
            className="splash-svg-canvas"
            data-testid="splash-svg-canvas"
            viewBox="0 0 1120 400"
            role="img"
            aria-labelledby="splash-svg-title splash-svg-desc"
          >
            <title id="splash-svg-title">
              {PROJECT_SPLASH_IDENTITY.nameAr} — {PROJECT_SPLASH_IDENTITY.nameEn}
            </title>
            <desc id="splash-svg-desc">
              لوحة موشن جرافيك متجهية من 5 مشاهد توضح استحواذ تصميم Figma عبر figma-reader، وفحص مكوّن React بـ Playwright، والمحاذاة الليزرية لـ 24 خاصية وPixelmatch، وتفسير النسب عبر Gemini AI.
            </desc>

            <defs data-testid="splash-svg-defs">
              <linearGradient id="splash-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#090F1E" />
                <stop offset="50%" stopColor="#0F172A" />
                <stop offset="100%" stopColor="#131F38" />
              </linearGradient>

              <linearGradient id="splash-figma-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={telemetry.refColor} />
                <stop offset="100%" stopColor="#F24E1E" />
              </linearGradient>

              <linearGradient id="splash-react-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#38BDF8" />
              </linearGradient>

              <linearGradient id="splash-laser-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
                <stop offset="50%" stopColor="#10B981" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
              </linearGradient>

              <linearGradient id="splash-emerald-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>

              <radialGradient id="splash-center-aura" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#0D9488" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
              </radialGradient>

              <pattern id="splash-subgrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="0.7"
                  strokeOpacity="0.75"
                />
              </pattern>

              <pattern id="splash-blueprint-grid" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="80" height="80" fill="url(#splash-subgrid)" />
                <path
                  d="M 80 0 L 0 0 0 80"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1"
                  strokeOpacity="0.65"
                />
                <circle cx="0" cy="0" r="1.5" fill="#38BDF8" fillOpacity="0.45" />
              </pattern>

              <clipPath id="splash-stage-clip">
                <rect x="0" y="0" width="1120" height="400" rx="14" />
              </clipPath>

              <radialGradient id="splash-portal-iris" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.16" />
                <stop offset="65%" stopColor="#38BDF8" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
              </radialGradient>

              <mask id="splash-aperture-mask">
                <rect x="0" y="0" width="1120" height="400" fill="white" />
              </mask>

              <filter id="splash-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g clipPath="url(#splash-stage-clip)">
              {/* Base Canvas & Precision Blueprint Grid */}
              <rect x="0" y="0" width="1120" height="400" fill="url(#splash-bg-grad)" />
              <rect x="0" y="0" width="1120" height="400" fill="url(#splash-blueprint-grid)" />
              <ellipse cx="560" cy="200" rx="430" ry="185" fill="url(#splash-center-aura)" />

              {/* ============================================================
                  SCENE 1: CINEMATIC INTRODUCTION — PRECISION BLUEPRINT & SCHEMA GRID
                  ============================================================ */}
              <g
                className={`splash-scene-layer ${activeSceneNum >= 1 ? 'is-visible' : 'is-hidden'} ${
                  isScene1 ? 'is-primary-scene' : ''
                }`}
                data-testid="splash-scene-1-group"
              >
                {/* Top & Bottom Coordinate Ruler Bars */}
                <line x1="40" y1="36" x2="1080" y2="36" stroke="#334155" strokeWidth="1.2" />
                <line x1="40" y1="368" x2="1080" y2="368" stroke="#334155" strokeWidth="1.2" />

                {/* Animated Orthographic Axis Paths */}
                <path
                  d="M 60 200 L 1060 200"
                  stroke="#38BDF8"
                  strokeWidth="1"
                  strokeDasharray="6 6"
                  strokeOpacity="0.45"
                  className="splash-axis-line"
                />
                <path
                  d="M 560 44 L 560 356"
                  stroke="#38BDF8"
                  strokeWidth="1"
                  strokeDasharray="6 6"
                  strokeOpacity="0.45"
                  className="splash-axis-line"
                />

                {/* Precision Calibration Circles */}
                <circle
                  cx="560"
                  cy="200"
                  r="142"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                  strokeDasharray="10 8"
                  strokeOpacity={isScene1 ? '0.82' : '0.22'}
                  className="splash-orbit-ring-slow"
                />
                <circle
                  cx="560"
                  cy="200"
                  r="104"
                  fill="none"
                  stroke="#FF9A62"
                  strokeWidth="1.2"
                  strokeDasharray="16 10"
                  strokeOpacity={isScene1 ? '0.75' : '0.18'}
                  className="splash-orbit-ring-reverse"
                />

                {/* Corner Blueprint Reticles */}
                <path d="M 48 64 L 48 46 L 68 46" fill="none" stroke="#38BDF8" strokeWidth="2" />
                <path d="M 1072 64 L 1072 46 L 1052 46" fill="none" stroke="#38BDF8" strokeWidth="2" />
                <path d="M 48 338 L 48 356 L 68 356" fill="none" stroke="#38BDF8" strokeWidth="2" />
                <path d="M 1072 338 L 1072 356 L 1052 356" fill="none" stroke="#38BDF8" strokeWidth="2" />

                {/* Schema & Viewport Telemetry Labels */}
                <g transform="translate(64, 52)">
                  <rect width="250" height="24" rx="6" fill="#0F172A" stroke="#334155" />
                  <text x="125" y="16" textAnchor="middle" fill="#38BDF8" fontSize="10.5" fontFamily="monospace" fontWeight="700">
                    CANONICAL DESIGN SCHEMA v2.0.0
                  </text>
                </g>
                <g transform="translate(806, 52)">
                  <rect width="250" height="24" rx="6" fill="#0F172A" stroke="#334155" />
                  <text x="125" y="16" textAnchor="middle" fill="#94A3B8" fontSize="10.5" fontFamily="monospace">
                    VIEWPORTS: 1440×950 • 390×844
                  </text>
                </g>

                {/* Scene 1 Exclusive Center Calibration Core */}
                {isScene1 && (
                  <g transform="translate(370, 140)" data-testid="splash-scene-1-hud">
                    <rect
                      x="0"
                      y="0"
                      width="380"
                      height="120"
                      rx="14"
                      fill="#090F1E"
                      fillOpacity="0.92"
                      stroke="#38BDF8"
                      strokeWidth="1.6"
                    />
                    <text x="190" y="34" textAnchor="middle" fill="#38BDF8" fontSize="11.5" fontFamily="monospace" fontWeight="800">
                      BLUEPRINT ORTHOGRAPHIC CALIBRATION
                    </text>
                    <text x="190" y="60" textAnchor="middle" fill="#F8FAFC" fontSize="13" fontWeight="800" direction="rtl" unicodeBidi="embed">
                      بناء شبكة القياس الهندسية لـ 24 خاصية تصميمية
                    </text>
                    <rect x="44" y="76" width="292" height="8" rx="4" fill="#1E293B" />
                    <rect
                      x="44"
                      y="76"
                      width={Math.max(24, Math.round(292 * timeline.sceneProgress))}
                      height="8"
                      rx="4"
                      fill="url(#splash-emerald-grad)"
                    />
                    <text x="190" y="104" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                      Target Node: {telemetry.nodeId} ({telemetry.nodeName}) • Grid Lock: {Math.round(timeline.sceneProgress * 100)}%
                    </text>
                  </g>
                )}
              </g>

              {/* ============================================================
                  SCENE 2: FEATURE VISUALIZATION — DUAL-LAYER FIGMA VS REACT
                  ============================================================ */}
              <g
                className={`splash-scene-layer ${activeSceneNum >= 2 ? 'is-visible' : 'is-hidden'} ${
                  isScene2 ? 'is-primary-scene' : ''
                }`}
                data-testid="splash-scene-2-group"
              >
                {/* LEFT ARTBOARD: Figma Reference Node (@leogcode/figma-reader) */}
                <g
                  className={`splash-artboard-figma ${activeSceneNum >= 3 ? 'is-converging-right' : ''}`}
                  data-testid="splash-figma-artboard"
                  transform="translate(68, 96)"
                >
                  <rect
                    x="0"
                    y="0"
                    width="280"
                    height="205"
                    rx="12"
                    fill="#0F172A"
                    fillOpacity="0.94"
                    stroke="#FF9A62"
                    strokeWidth="1.6"
                  />
                  <rect x="0" y="0" width="280" height="30" rx="12" fill="#1E293B" />
                  <circle cx="16" cy="15" r="4.5" fill="#F24E1E" />
                  <circle cx="30" cy="15" r="4.5" fill="#FF9A62" />
                  <circle cx="44" cy="15" r="4.5" fill="#A259FF" />
                  <text x="148" y="19" textAnchor="middle" fill="#F8FAFC" fontSize="10.5" fontFamily="monospace" fontWeight="700">
                    FIGMA SOURCE • {telemetry.nodeId}
                  </text>

                  {/* Vector Bezier Pen Curve & Handles */}
                  <path
                    d="M 28 74 C 68 42, 212 42, 252 74"
                    fill="none"
                    stroke="#A259FF"
                    strokeWidth="1.3"
                    strokeDasharray="4 3"
                  />
                  <line x1="28" y1="74" x2="68" y2="42" stroke="#38BDF8" strokeWidth="1" />
                  <line x1="252" y1="74" x2="212" y2="42" stroke="#38BDF8" strokeWidth="1" />
                  <circle cx="68" cy="42" r="3" fill="#38BDF8" />
                  <circle cx="212" cy="42" r="3" fill="#38BDF8" />

                  {/* Genuine Figma Reference Node Shape */}
                  <rect
                    x="62"
                    y="66"
                    width="156"
                    height="72"
                    rx={Math.max(4, Math.min(18, telemetry.borderRadius))}
                    fill="url(#splash-figma-grad)"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    filter="url(#splash-glow-filter)"
                  />
                  {/* Corner Selection Handles */}
                  <rect x="58" y="62" width="7" height="7" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5" />
                  <rect x="214" y="62" width="7" height="7" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5" />
                  <rect x="58" y="134" width="7" height="7" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5" />
                  <rect x="214" y="134" width="7" height="7" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5" />

                  <text x="140" y="101" textAnchor="middle" fill="#0F172A" fontSize="12.5" fontWeight="800">
                    {telemetry.nodeName.slice(0, 20)}
                  </text>
                  <text x="140" y="120" textAnchor="middle" fill="#0F172A" fontSize="10" fontFamily="monospace" fontWeight="700">
                    {telemetry.refDimensions} • r={telemetry.borderRadius}px
                  </text>

                  {/* Dimension & Adapter Badges */}
                  <rect x="18" y="152" width="118" height="22" rx="5" fill="#1E293B" stroke="#334155" />
                  <text x="77" y="167" textAnchor="middle" fill="#FF9A62" fontSize="10" fontFamily="monospace" fontWeight="700">
                    {telemetry.refColor}
                  </text>

                  <rect x="144" y="152" width="118" height="22" rx="5" fill="#1E293B" stroke="#334155" />
                  <text x="203" y="167" textAnchor="middle" fill="#38BDF8" fontSize="9.5" fontFamily="monospace">
                    figma-reader CLI
                  </text>

                  <text x="140" y="193" textAnchor="middle" fill="#CBD5E1" fontSize="10.5" fontWeight="700" direction="rtl" unicodeBidi="embed">
                    مرجع تصميم فيجما الأصلي (Figma Spec)
                  </text>
                </g>

                {/* Scene 2 Exclusive Acquisition Delta Bridge */}
                {isScene2 && (
                  <g transform="translate(405, 136)" data-testid="splash-scene-2-bridge">
                    <rect
                      x="0"
                      y="0"
                      width="310"
                      height="118"
                      rx="12"
                      fill="#090F1E"
                      fillOpacity="0.92"
                      stroke="#F59E0B"
                      strokeWidth="1.5"
                    />
                    <text x="155" y="30" textAnchor="middle" fill="#FBBF24" fontSize="11" fontFamily="monospace" fontWeight="800">
                      DUAL ACQUISITION • DELTA DETECTED
                    </text>
                    <text x="155" y="54" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontFamily="monospace" fontWeight="700">
                      Figma: {telemetry.refDimensions} vs React: {telemetry.actDimensions}
                    </text>
                    <text x="155" y="76" textAnchor="middle" fill="#38BDF8" fontSize="10.5" fontFamily="monospace">
                      Width Drift: {telemetry.widthDeltaLabel} | Initial Score: {telemetry.propertyScore}%
                    </text>
                    <text x="155" y="100" textAnchor="middle" fill="#CBD5E1" fontSize="10.5" fontWeight="700" direction="rtl" unicodeBidi="embed">
                      استحواذ محلي عبر figma-reader وفحص Playwright
                    </text>
                  </g>
                )}

                {/* RIGHT ARTBOARD: React Implementation (<DesignItem /> + Playwright) */}
                <g
                  className={`splash-artboard-react ${activeSceneNum >= 3 ? 'is-converging-left' : ''}`}
                  data-testid="splash-react-artboard"
                  transform="translate(772, 96)"
                >
                  <rect
                    x="0"
                    y="0"
                    width="280"
                    height="205"
                    rx="12"
                    fill="#0F172A"
                    fillOpacity="0.94"
                    stroke="#38BDF8"
                    strokeWidth="1.6"
                  />
                  <rect x="0" y="0" width="280" height="30" rx="12" fill="#1E293B" />
                  <circle cx="16" cy="15" r="4.5" fill="#38BDF8" />
                  <circle cx="30" cy="15" r="4.5" fill="#2563EB" />
                  <circle cx="44" cy="15" r="4.5" fill="#10B981" />
                  <text x="150" y="19" textAnchor="middle" fill="#F8FAFC" fontSize="10.5" fontFamily="monospace" fontWeight="700">
                    REACT DOM • &lt;DesignItem /&gt;
                  </text>

                  {/* Playwright Bounding Calipers */}
                  <line x1="42" y1="54" x2="238" y2="54" stroke="#F59E0B" strokeWidth="1.2" strokeDasharray="4 2" />
                  <line x1="42" y1="49" x2="42" y2="59" stroke="#F59E0B" strokeWidth="1.5" />
                  <line x1="238" y1="49" x2="238" y2="59" stroke="#F59E0B" strokeWidth="1.5" />
                  <text x="140" y="47" textAnchor="middle" fill="#FBBF24" fontSize="9.5" fontFamily="monospace" fontWeight="700">
                    Playwright DOM: {telemetry.actDimensions} ({telemetry.widthDeltaLabel})
                  </text>

                  {/* React Component Box (Smoothly morphs width across Scene 3+) */}
                  <rect
                    x={Math.round(44 + 18 * syncFactor)}
                    y="66"
                    width={Math.round(192 - 36 * syncFactor)}
                    height="72"
                    rx={Math.max(4, Math.min(18, telemetry.borderRadius))}
                    fill="url(#splash-react-grad)"
                    stroke={syncFactor >= 0.75 ? '#10B981' : '#F59E0B'}
                    strokeWidth="1.8"
                  />
                  <text x="140" y="101" textAnchor="middle" fill="#FFFFFF" fontSize="12.5" fontWeight="800">
                    {telemetry.nodeName.slice(0, 20)}
                  </text>
                  <text x="140" y="120" textAnchor="middle" fill="#E0F2FE" fontSize="10" fontFamily="monospace" fontWeight="700">
                    {syncFactor >= 0.75 ? telemetry.refDimensions : telemetry.actDimensions} • CSS Computed
                  </text>

                  <rect x="18" y="152" width="118" height="22" rx="5" fill="#1E293B" stroke="#334155" />
                  <text x="77" y="167" textAnchor="middle" fill="#38BDF8" fontSize="9.5" fontFamily="monospace">
                    Playwright 1.55
                  </text>

                  <rect x="144" y="152" width="118" height="22" rx="5" fill="#1E293B" stroke="#334155" />
                  <text x="203" y="167" textAnchor="middle" fill="#F472B6" fontSize="9.5" fontFamily="monospace">
                    Storybook 7 Stories
                  </text>

                  <text x="140" y="193" textAnchor="middle" fill="#CBD5E1" fontSize="10.5" fontWeight="700" direction="rtl" unicodeBidi="embed">
                    التصميم الحالي المنفّذ في React (Actual DOM)
                  </text>
                </g>
              </g>

              {/* ============================================================
                  SCENE 3: TRANSFORMATION — LASER ALIGNMENT, 24-PROP & PIXELMATCH
                  ============================================================ */}
              <g
                className={`splash-scene-layer ${activeSceneNum >= 3 ? 'is-visible' : 'is-hidden'} ${
                  isScene3 ? 'is-primary-scene' : ''
                }`}
                data-testid="splash-scene-3-group"
              >
                {/* Connecting Convergence Paths from Left & Right Artboards into Center Stage */}
                <path
                  d="M 348 190 C 370 190, 365 175, 382 175"
                  fill="none"
                  stroke="#FF9A62"
                  strokeWidth="2.2"
                  strokeDasharray="6 4"
                  className="splash-flow-line"
                />
                <path
                  d="M 772 190 C 750 190, 755 175, 738 175"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.2"
                  strokeDasharray="6 4"
                  className="splash-flow-line"
                />

                {/* Central Synchronization & Pixelmatch Chamber (y=96..274 for zero collision with Crest) */}
                <g transform="translate(382, 96)" data-testid="splash-alignment-chamber">
                  <rect
                    x="0"
                    y="0"
                    width="356"
                    height="178"
                    rx="14"
                    fill="#090F1E"
                    fillOpacity="0.92"
                    stroke={activeSceneNum >= 4 ? '#10B981' : '#2563EB'}
                    strokeWidth="1.8"
                  />

                  {/* Overlapping Dual Layers Synchronizing Smoothly in Center */}
                  <rect
                    x="84"
                    y="22"
                    width="188"
                    height="74"
                    rx="8"
                    fill="none"
                    stroke="#FF9A62"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                  />
                  <rect
                    x={Math.round(68 + 16 * syncFactor)}
                    y="22"
                    width={Math.round(220 - 32 * syncFactor)}
                    height="74"
                    rx="8"
                    fill="#1E293B"
                    fillOpacity="0.78"
                    stroke="#10B981"
                    strokeWidth="2"
                  />

                  {/* Laser Scan Beam */}
                  <g className="splash-laser-beam" data-testid="splash-laser-beam">
                    <rect x="64" y="16" width="228" height="8" rx="4" fill="url(#splash-laser-grad)" />
                    <line
                      x1="56"
                      y1="59"
                      x2="300"
                      y2="59"
                      stroke="#10B981"
                      strokeWidth="2"
                      filter="url(#splash-glow-filter)"
                    />
                  </g>

                  <text x="178" y="52" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="800">
                    1:1 PIXELMATCH &amp; 24-PROPERTY SYNC
                  </text>
                  <text x="178" y="73" textAnchor="middle" fill="#34D399" fontSize="11" fontFamily="monospace" fontWeight="700">
                    Fidelity: {telemetry.propertyScore}% → {liveFidelityScore}% | Proximity: {telemetry.continuousScore}%
                  </text>
                  <text x="178" y="89" textAnchor="middle" fill="#93C5FD" fontSize="9.8" fontFamily="monospace">
                    AI Engine: {telemetry.aiModel} (Markdown Reasons)
                  </text>

                  {/* Neural Gemini AI Waveform */}
                  <path
                    d="M 24 124 Q 62 106, 100 124 T 176 124 T 252 124 T 332 124"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="1.8"
                    className="splash-ai-wave-path"
                  />
                  <path
                    d="M 24 124 Q 62 142, 100 124 T 176 124 T 252 124 T 332 124"
                    fill="none"
                    stroke="#A259FF"
                    strokeWidth="1.4"
                    strokeOpacity="0.75"
                    className="splash-ai-wave-path"
                  />

                  <text x="178" y="159" textAnchor="middle" fill="#E2E8F0" fontSize="11" fontWeight="700" direction="rtl" unicodeBidi="embed">
                    محاذاة الطبقات وتفسير أسباب النسب بالذكاء الاصطناعي
                  </text>
                </g>

                {/* 24-Property Matrix Bar below the Chamber (y=286..348) */}
                <g data-testid="splash-24-property-matrix">
                  {propertyCells.map(cell => (
                    <g key={cell.code} transform={`translate(${cell.x}, ${cell.y})`}>
                      <rect
                        width="38"
                        height="18"
                        rx="4"
                        fill="#0F172A"
                        stroke={cell.color}
                        strokeWidth="1.2"
                      />
                      <text
                        x="19"
                        y="12.5"
                        textAnchor="middle"
                        fill={cell.color}
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="700"
                      >
                        {cell.code}
                      </text>
                    </g>
                  ))}
                </g>
              </g>

              {/* ============================================================
                  SCENE 4: PRODUCT IDENTITY REVEAL — BRAND CREST & 7-TOOL ORBIT
                  ============================================================ */}
              <g
                className={`splash-scene-layer ${activeSceneNum >= 4 ? 'is-visible is-prominent' : 'is-hidden'} ${
                  isScene4 ? 'is-primary-scene' : ''
                }`}
                data-testid="splash-scene-4-group"
              >
                {/* Central Product Crest Badge (cy=62, r=26 -> y=36..88, cleanly above y=96 chamber and below y=28 pill) */}
                <g transform="translate(560, 62)" data-testid="splash-brand-crest">
                  <circle
                    cx="0"
                    cy="0"
                    r="26"
                    fill="#0F172A"
                    stroke="url(#splash-emerald-grad)"
                    strokeWidth="2.4"
                    filter="url(#splash-glow-filter)"
                  />
                  {/* React Orbital Ellipses */}
                  <ellipse
                    cx="0"
                    cy="0"
                    rx="19"
                    ry="7.5"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="1.2"
                    transform="rotate(30)"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    rx="19"
                    ry="7.5"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="1.2"
                    transform="rotate(-30)"
                  />
                  {/* Figma Geometric Node Dots + Verified Check */}
                  <circle cx="-7" cy="-6" r="3.5" fill="#F24E1E" />
                  <circle cx="7" cy="-6" r="3.5" fill="#FF9A62" />
                  <circle cx="-7" cy="2" r="3.5" fill="#A259FF" />
                  <circle cx="7" cy="2" r="3.5" fill="#1ABCFE" />
                  <circle cx="-7" cy="9" r="3.5" fill="#0ACF83" />
                  <path
                    d="M -2 7 L 2.5 11.5 L 11 2"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>

                {/* 7-Tool Architecture Constellation Strip at Bottom (y=358..386) */}
                <g transform="translate(46, 358)" data-testid="splash-tools-constellation">
                  {PROJECT_SPLASH_IDENTITY.tools.map((tool, index) => {
                    const x = index * 148;
                    return (
                      <g key={tool.id} transform={`translate(${x}, 0)`}>
                        <rect
                          x="0"
                          y="0"
                          width="140"
                          height="28"
                          rx="7"
                          fill="#0F172A"
                          stroke={tool.color}
                          strokeWidth="1.2"
                        />
                        <circle cx="13" cy="14" r="4" fill={tool.color} />
                        <text
                          x="76"
                          y="18"
                          textAnchor="middle"
                          fill="#F8FAFC"
                          fontSize="9.5"
                          fontFamily="monospace"
                          fontWeight="700"
                        >
                          {tool.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>

              {/* ============================================================
                  SCENE 5: SEAMLESS APPLICATION TRANSITION — APERTURE READY
                  ============================================================ */}
              <g
                className={`splash-scene-layer ${isScene5 ? 'is-visible is-primary-scene' : 'is-hidden'}`}
                data-testid="splash-scene-5-group"
              >
                {isScene5 && (
                  <g className="splash-portal-rings" pointerEvents="none">
                    <circle
                      cx="560"
                      cy="185"
                      r={Math.round(135 + 30 * timeline.sceneProgress)}
                      fill="url(#splash-portal-iris)"
                      stroke="#10B981"
                      strokeWidth="1.2"
                      strokeDasharray="14 10"
                      strokeOpacity="0.32"
                      className="splash-orbit-ring-slow"
                    />
                    <circle
                      cx="560"
                      cy="185"
                      r={Math.round(108 + 18 * timeline.sceneProgress)}
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="1"
                      strokeDasharray="8 8"
                      strokeOpacity="0.28"
                      className="splash-orbit-ring-reverse"
                    />
                  </g>
                )}
                <rect
                  x="375"
                  y="6"
                  width="370"
                  height="22"
                  rx="11"
                  fill="#065F46"
                  fillOpacity="0.96"
                  stroke="#10B981"
                  strokeWidth="1.2"
                />
                <text x="560" y="20.5" textAnchor="middle" fill="#ECFDF5" fontSize="10.5" fontWeight="800" direction="rtl" unicodeBidi="embed">
                  ✓ اكتملت تهيئة محرك المطابقة الذكي — لوحة العمل جاهزة للتفاعل الفوري
                </text>
              </g>
            </g>
          </svg>
        </div>
      )}

      {/* Interactive 5-Scene Storyboard Stepper & Progress Timeline */}
      <div className="splash-storyboard-bar" data-testid="splash-scene-stepper">
        <div className="splash-scene-pills" role="tablist" aria-label="مشاهد الموشن جرافيك الخمسة">
          {SPLASH_SCENES.map(scene => {
            const isCurrent = scene.number === activeSceneNum;
            const isDone = scene.number < activeSceneNum || timeline.isCompleted;
            return (
              <button
                key={scene.id}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                className={`splash-scene-pill ${isCurrent ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
                data-testid={`splash-scene-btn-${scene.number}`}
                onClick={() => handleSelectScene(scene.number)}
              >
                <span className="scene-pill-num">{scene.number}</span>
                <span className="scene-pill-text">{scene.titleAr.replace(/^المشهد \d+:\s*/, '')}</span>
              </button>
            );
          })}
        </div>

        <div className="splash-progress-meta">
          <div className="splash-progress-track" aria-hidden="true">
            <div
              className="splash-progress-fill"
              data-testid="splash-progress-bar"
              style={{ width: `${timeline.overallProgress}%` }}
            />
          </div>
          <span className="splash-progress-pct" data-testid="splash-progress-text">
            {timeline.overallProgress}%
          </span>
        </div>
      </div>
    </section>
  );
}
