/**
 * Project-Aware SVG Motion Graphics Splash Screen Choreography & Telemetry Engine
 * Tailored specifically to: Figma Fidelity Engine (7-Tool Architecture + Gemini AI Markdown Auditor)
 */

export const PROJECT_SPLASH_IDENTITY = Object.freeze({
  projectId: 'figma-fidelity-client-mvp',
  nameAr: 'محرك مطابقة تصميم Figma مع التصميم الحالي بالذكاء الاصطناعي',
  nameEn: 'FIGMA-TO-REACT FIDELITY & AI MARKDOWN AUDITOR',
  taglineAr:
    'استحواذ محلي عبر figma-reader، وفحص DOM الفعلي بـ Playwright، ومقارنة 24 خاصية وPixelmatch مع تفسير النسب بالمارك داون عبر Gemini AI',
  taglineEn:
    'Local-first Figma-to-React design verification, 1:1 Pixelmatch diffing & Gemini AI Markdown explanations',
  schemaVersion: 'Canonical Design Schema v2.0.0',
  direction: 'rtl',
  languages: ['ar', 'en'],
  palette: Object.freeze({
    canvasDark: '#0F172A',
    canvasSlate: '#1E293B',
    gridLine: '#334155',
    figmaCoral: '#FF9A62',
    figmaRed: '#F24E1E',
    figmaPurple: '#A259FF',
    figmaGreen: '#0ACF83',
    reactCyan: '#38BDF8',
    fidelityBlue: '#2563EB',
    verifiedEmerald: '#10B981',
    visualTeal: '#14B8A6',
    warningAmber: '#F59E0B',
  }),
  tools: Object.freeze([
    { id: 'figma-reader', label: 'figma-reader 0.4.2', roleAr: 'استحواذ Figma الأساسي', color: '#FF9A62' },
    { id: 'openfig-core', label: 'OpenFig Core 0.4.1', roleAr: 'محلل .fig الاحتياطي', color: '#A259FF' },
    { id: 'figma-export', label: 'FFlate ZIP Adapter', roleAr: 'استيراد الحزم المحلية', color: '#F59E0B' },
    { id: 'storybook', label: 'Storybook 10.6', roleAr: '7 سيناريوهات قياسية', color: '#FF4785' },
    { id: 'playwright', label: 'Playwright 1.55', roleAr: 'فحص DOM واللقطات', color: '#2563EB' },
    { id: 'pixelmatch', label: 'Pixelmatch 7.1', roleAr: 'مقارنة البكسل 1:1', color: '#14B8A6' },
    { id: 'reg-cli-gemini', label: 'reg-cli + Gemini AI', roleAr: 'تقارير وتفسير النسب', color: '#10B981' },
  ]),
});

export const SPLASH_SCENES = Object.freeze([
  {
    number: 1,
    id: 'scene-1-intro',
    key: 'intro',
    titleAr: 'المشهد 1: بناء شبكة القياس الهندسية',
    titleEn: 'Scene 1 — Precision Blueprint & Schema Grid',
    subtitleAr: 'رسم محاور الإحداثيات وقواعد Canonical Design Schema v2.0.0 بدقة متجهية',
    durationMs: 900,
    startRatio: 0.0,
    endRatio: 0.2,
    visualMetaphor: 'SVG path drawing of orthographic design rulers, viewport bounds, and calibration rings',
  },
  {
    number: 2,
    id: 'scene-2-features',
    key: 'features',
    titleAr: 'المشهد 2: استحواذ تصميم Figma وفحص مكوّن React',
    titleEn: 'Scene 2 — Dual-Layer Figma & React Acquisition',
    subtitleAr: 'ظهور طبقة مرجع Figma عبر figma-reader مقابل طبقة مكوّن React المقاسة عبر Playwright',
    durationMs: 1100,
    startRatio: 0.2,
    endRatio: 0.45,
    visualMetaphor: 'Dual artboards with vector bezier handles on Figma reference vs CSS box calipers on React DOM',
  },
  {
    number: 3,
    id: 'scene-3-transform',
    key: 'transform',
    titleAr: 'المشهد 3: المحاذاة الليزرية ومطابقة الـ 24 خاصية وPixelmatch',
    titleEn: 'Scene 3 — Laser Alignment, 24-Property & Pixelmatch Sync',
    subtitleAr: 'انزلاق الطبقتين نحو مركز الفحص وتصحيح انحراف الأبعاد (140px → 112px) وتحليل Gemini AI',
    durationMs: 1200,
    startRatio: 0.45,
    endRatio: 0.72,
    visualMetaphor: 'Converging SVG layers, laser scan sweep, pixel diff matrix morphing from mismatch to 100% match',
  },
  {
    number: 4,
    id: 'scene-4-identity',
    key: 'identity',
    titleAr: 'المشهد 4: كشف هوية محرك مطابقة Figma بالذكاء الاصطناعي',
    titleEn: 'Scene 4 — Figma Fidelity Engine & AI Auditor Reveal',
    subtitleAr: 'اندماج منحنيات Figma ومدارات React في شعار التحقق الموحد مع منظومة الأدوات السبع',
    durationMs: 900,
    startRatio: 0.72,
    endRatio: 0.9,
    visualMetaphor: 'Interlocked Figma-React vector crest, verified fidelity shield, and 7-tool orbital constellation',
  },
  {
    number: 5,
    id: 'scene-5-transition',
    key: 'transition',
    titleAr: 'المشهد 5: الانتقال السلس إلى مساحة العمل التفاعلية',
    titleEn: 'Scene 5 — Seamless Workspace Aperture Transition',
    subtitleAr: 'توسّع قناع SVG الهندسي واستقرار شريط العرض الحركي أعلى لوحة المطابقة الجاهزة',
    durationMs: 500,
    startRatio: 0.9,
    endRatio: 1.0,
    visualMetaphor: 'SVG aperture mask expansion and smooth dock transition into the live dashboard',
  },
]);

export const DEFAULT_SPLASH_DURATION_MS = SPLASH_SCENES.reduce((acc, s) => acc + s.durationMs, 0);

/**
 * Computes deterministic timeline state for any elapsed time or manual scene override.
 */
export function computeSplashTimelineState(
  elapsedMs = 0,
  {
    totalDurationMs = DEFAULT_SPLASH_DURATION_MS,
    reducedMotion = false,
    manualSceneNumber = null,
    skipped = false,
  } = {}
) {
  const safeTotal = Number.isFinite(totalDurationMs) && totalDurationMs > 0 ? totalDurationMs : DEFAULT_SPLASH_DURATION_MS;

  if (skipped) {
    const lastScene = SPLASH_SCENES[SPLASH_SCENES.length - 1];
    return {
      state: 'completed',
      activeSceneNumber: 5,
      activeScene: lastScene,
      sceneProgress: 1,
      overallProgress: 100,
      isCompleted: true,
      reducedMotion: Boolean(reducedMotion),
    };
  }

  if (manualSceneNumber != null) {
    const clampedNum = Math.max(1, Math.min(SPLASH_SCENES.length, Math.trunc(Number(manualSceneNumber) || 1)));
    const targetScene = SPLASH_SCENES[clampedNum - 1];
    return {
      state: 'paused',
      activeSceneNumber: clampedNum,
      activeScene: targetScene,
      sceneProgress: 1,
      overallProgress: Math.round(targetScene.endRatio * 100),
      isCompleted: false,
      reducedMotion: Boolean(reducedMotion),
    };
  }

  if (reducedMotion) {
    const identityScene = SPLASH_SCENES[3]; // Scene 4 Identity Reveal
    return {
      state: 'completed',
      activeSceneNumber: 4,
      activeScene: identityScene,
      sceneProgress: 1,
      overallProgress: 100,
      isCompleted: true,
      reducedMotion: true,
    };
  }

  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const clampedElapsed = Math.min(safeElapsed, safeTotal);
  const ratio = clampedElapsed / safeTotal;
  const overallProgress = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  let activeScene = SPLASH_SCENES[0];
  for (const scene of SPLASH_SCENES) {
    if (ratio >= scene.startRatio && ratio <= scene.endRatio) {
      activeScene = scene;
      break;
    }
  }
  const span = Math.max(0.0001, activeScene.endRatio - activeScene.startRatio);
  const sceneProgress = Math.min(1, Math.max(0, Number(((ratio - activeScene.startRatio) / span).toFixed(3))));
  const isCompleted = safeElapsed >= safeTotal;

  return {
    state: isCompleted ? 'completed' : 'playing',
    activeSceneNumber: activeScene.number,
    activeScene,
    sceneProgress,
    overallProgress,
    isCompleted,
    reducedMotion: false,
  };
}

/**
 * Adapts the Splash Screen SVG telemetry to the live project reference, actual component, and AI comparison state.
 */
export function adaptSplashMetricsToProject({
  ref = null,
  actual = null,
  comparison = null,
  readerStatus = null,
  preferredAiModel = 'gemini-flash-latest',
} = {}) {
  const nodeId = String(ref?.nodeId || '942:2734');
  const nodeName = String(ref?.nodeName || ref?.text || 'Buy ice cream');
  const refWidth = Number(ref?.width) > 0 ? Math.round(Number(ref.width)) : 112;
  const refHeight = Number(ref?.height) > 0 ? Math.round(Number(ref.height)) : 100;
  const actWidth = Number(actual?.width) > 0 ? Math.round(Number(actual.width)) : 140;
  const actHeight = Number(actual?.height) > 0 ? Math.round(Number(actual.height)) : 100;
  const refColor = String(ref?.backgroundColor || '#FF9A62').toUpperCase();
  const actColor = String(actual?.backgroundColor || refColor).toUpperCase();
  const borderRadius = Number.isFinite(Number(ref?.borderRadius)) ? Math.round(Number(ref.borderRadius)) : 6;
  const propertyScore = Number.isFinite(Number(comparison?.score)) ? Math.round(Number(comparison.score) * 10) / 10 : 75;
  const continuousScore = Number.isFinite(Number(comparison?.continuousScore))
    ? Math.round(Number(comparison.continuousScore) * 10) / 10
    : 95;
  const widthDelta = Math.round((actWidth - refWidth) * 10) / 10;
  const widthDeltaLabel = widthDelta === 0 ? '0px (1:1)' : `${widthDelta > 0 ? '+' : ''}${widthDelta}px`;

  return {
    nodeId,
    nodeName,
    refDimensions: `${refWidth}×${refHeight}px`,
    actDimensions: `${actWidth}×${actHeight}px`,
    refWidth,
    refHeight,
    actWidth,
    actHeight,
    refColor,
    actColor,
    borderRadius,
    propertyScore,
    continuousScore,
    widthDelta,
    widthDeltaLabel,
    aiModel: String(preferredAiModel || 'gemini-flash-latest'),
    loggedIn: Boolean(readerStatus?.loggedIn),
    primaryAdapter: '@leogcode/figma-reader@0.4.2',
  };
}
