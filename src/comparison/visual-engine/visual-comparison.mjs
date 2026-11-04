import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { validateVisualBaseline } from '../../design/asset-manager/asset-manager.mjs';

/**
 * Compares two PNG images using Pixelmatch (Tool 6) and optionally runs reg-cli (Tool 7).
 * Strictly enforces dimension matching, anti-aliasing settings, and baseline authenticity classification.
 */
export function runPixelmatchComparison(expectedPngBytes, actualPngBytes, {
  threshold = 0.1,
  includeAA = false,
  source = 'genuine-figma-image-user-supplied',
} = {}) {
  const baselineInfo = validateVisualBaseline(source);
  if (!expectedPngBytes || !actualPngBytes) {
    return {
      ok: false,
      reason: 'missing_images',
      pixelSimilarity: null,
      genuineVisualSimilarity: null,
      diffPixels: null,
      baselineInfo,
      notes: ['لا تتوفر صورتا المقارنة (المرجع والتنفيذ).'],
    };
  }

  let expected;
  let actual;
  try {
    expected = PNG.sync.read(Buffer.from(expectedPngBytes));
    actual = PNG.sync.read(Buffer.from(actualPngBytes));
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_png',
      pixelSimilarity: null,
      genuineVisualSimilarity: null,
      diffPixels: null,
      baselineInfo,
      notes: [`فشل قراءة ملف PNG: ${err.message}`],
    };
  }

  const expectedPixels = { width: expected.width, height: expected.height };
  const actualPixels = { width: actual.width, height: actual.height };

  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      ok: false,
      reason: 'dimension_mismatch',
      expectedPixels,
      actualPixels,
      pixelSimilarity: null,
      genuineVisualSimilarity: null,
      diffPixels: null,
      baselineInfo,
      notes: [
        `رفض المقارنة البصرية لاختلاف الأبعاد: المرجع (${expected.width}×${expected.height}) مقابل التنفيذ (${actual.width}×${actual.height}). لا يتم تغيير الحجم قسرًا.`,
      ],
    };
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const mismatched = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold, includeAA }
  );

  const totalPixels = expected.width * expected.height;
  const rawSimilarity = +(100 * (1 - mismatched / totalPixels)).toFixed(2);
  const diffBuffer = PNG.sync.write(diff);

  return {
    ok: true,
    source,
    baselineInfo,
    expectedPixels,
    actualPixels,
    totalPixels,
    diffPixels: mismatched,
    mismatchRatio: +(mismatched / totalPixels).toFixed(6),
    pixelSimilarity: rawSimilarity,
    // Never report synthetic reference images as genuine Figma visual similarity
    genuineVisualSimilarity: baselineInfo.isGenuine ? rawSimilarity : null,
    syntheticVisualSimilarity: baselineInfo.isGenuine ? null : rawSimilarity,
    diffBuffer,
    threshold,
    includeAA,
    notes: [baselineInfo.reason],
  };
}

/**
 * Generates visual regression HTML and JSON reports using reg-cli (Tool 7) via safe execFileSync.
 */
export function runRegCliReport({
  cwd = process.cwd(),
  actualDir = path.join(cwd, 'out', 'visual', 'actual'),
  expectedDir = path.join(cwd, 'out', 'visual', 'expected'),
  diffDir = path.join(cwd, 'out', 'visual', 'diff'),
  reportHtmlPath = path.join(cwd, 'out', 'visual', 'reg-cli-report.html'),
  reportJsonPath = path.join(cwd, 'out', 'visual', 'reg.json'),
  threshold = 0.1,
} = {}) {
  const regCliJs = path.join(cwd, 'node_modules', 'reg-cli', 'dist', 'cli.js');
  if (!fs.existsSync(regCliJs)) {
    return {
      ok: false,
      error: 'حزمة reg-cli غير موجودة في node_modules.',
    };
  }
  fs.mkdirSync(path.dirname(reportHtmlPath), { recursive: true });
  try {
    execFileSync(
      process.execPath,
      [
        regCliJs,
        actualDir,
        expectedDir,
        diffDir,
        '-R',
        reportHtmlPath,
        '-J',
        reportJsonPath,
        '-I',
        '-M',
        String(threshold),
      ],
      { cwd, stdio: 'pipe', timeout: 60_000, windowsHide: true }
    );
    const regJson = fs.existsSync(reportJsonPath)
      ? JSON.parse(fs.readFileSync(reportJsonPath, 'utf8'))
      : null;
    return {
      ok: fs.existsSync(reportHtmlPath),
      reportHtmlPath,
      reportJsonPath,
      regJson,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    };
  }
}

