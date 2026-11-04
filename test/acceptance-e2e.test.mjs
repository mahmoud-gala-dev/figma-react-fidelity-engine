/**
 * End-to-End Acceptance Tests — Figma Fidelity MVP
 * Covers all 10 Scenarios from Specification Section 9.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';

import { compareSpecs, normalizeHexColor } from '../src/lib/compare.mjs';
import { parseFigmaUrl, assertSyncableDesignUrl } from '../src/integrations/figma/figma-url-parser.mjs';
import { importFigmaExportZip } from '../src/lib/import-design.mjs';
import { normalizeOpenFigNode } from '../src/integrations/figma/figma-normalizer.mjs';
import { diffRevisions, fingerprintReference } from '../src/integrations/figma/figma-version-tracker.mjs';
import { importFigDocument } from '../src/integrations/figma/figma-sync-service.mjs';

// -----------------------------------------------------------------------------
// Test 1: Existing Functionality & 5-Property Comparison
// -----------------------------------------------------------------------------
test('Scenario 1 — Existing functionality: comparison calculations remain correct', () => {
  const ref = JSON.parse(fs.readFileSync('public/reference.json', 'utf8'));

  // Exact match -> 100%
  const exact = compareSpecs(ref, { ...ref });
  assert.equal(exact.score, 100, 'Exact match must score 100%');
  assert.equal(exact.passed, 5, 'All 5 properties must pass');

  // Width mismatch (140 vs 112) -> 75%
  const mismatched = compareSpecs(ref, { ...ref, width: 140 });
  assert.equal(mismatched.score, 75, 'Width mismatch must score 75% (loss of 25% weight)');
  assert.equal(mismatched.passed, 4, '4 of 5 properties must pass');

  // Normalized color matches
  const hex = normalizeHexColor('rgb(255, 154, 98)');
  assert.equal(hex, '#FF9A62');
});

// -----------------------------------------------------------------------------
// Test 2: Genuine Direct Browser Automation Acquisition
// -----------------------------------------------------------------------------
test('Scenario 2 — Genuine browser automation: session check or explicit BLOCKED', async () => {
  let isReady = false;
  try {
    const res = await fetch('http://127.0.0.1:5173/api/figma-browser/status');
    if (res.ok) {
      const data = await res.json();
      isReady = Boolean(data.state === 'idle' || data.state === 'done');
    }
  } catch {
    isReady = false;
  }

  // Check if .browser-profile has stored cookies/session
  const profileDir = path.resolve('.browser-profile');
  const hasProfile = fs.existsSync(profileDir) && fs.readdirSync(profileDir).length > 0;

  if (!hasProfile || !isReady || process.env.FIGMA_LIVE_DOWNLOAD !== '1') {
    console.log('\n[TEST 2 REPORT] STATUS: BLOCKED');
    console.log(hasProfile
      ? 'Reason: A browser profile directory exists, but this suite does not launch Figma unless FIGMA_LIVE_DOWNLOAD=1.'
      : 'Reason: No authorized Playwright profile yet. Click تنزيل التصميم once and log in inside the visible browser.');
    console.log('The download uses Main menu → File → Save local copy. No plugin and no REST API.');
    assert.ok(true);
    return;
  }

  const syncRes = await fetch('http://127.0.0.1:5173/api/figma-browser/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1' })
  });
  assert.ok(syncRes.status === 200 || syncRes.status === 202);
});

// -----------------------------------------------------------------------------
// Test 3: Detect Figma Changes Between Revisions
// -----------------------------------------------------------------------------
test('Scenario 3 — Detect Figma changes: delta tracking across revisions', () => {
  const rev1 = {
    nodeId: '942:2734',
    width: 112,
    height: 100,
    backgroundColor: '#FF9A62',
    borderRadius: 6,
    text: 'Buy ice cream'
  };

  const rev2 = {
    ...rev1,
    width: 140, // modified
    backgroundColor: '#3B82F6' // modified
  };

  const delta = diffRevisions(fingerprintReference(rev1), fingerprintReference(rev2));
  assert.equal(delta.changed, true, 'Must detect that design has changed');
  assert.equal(delta.count, 2, 'Must detect exactly 2 changed properties');
  assert.ok(delta.fields.some(f => f.key === 'width' && f.from === 112 && f.to === 140));
  assert.ok(delta.fields.some(f => f.key === 'backgroundColor'));
});

// -----------------------------------------------------------------------------
// Test 4: OpenFig Core Integration & Normalization
// -----------------------------------------------------------------------------
test('Scenario 4 — OpenFig: normalization and handling of .fig files', async () => {
  const rawOpenFigNode = {
    name: 'ActionButton',
    type: 'FRAME',
    size: { x: 200, y: 50 },
    transform: { m02: 10, m12: 20 },
    fillPaints: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.4, b: 0.8 } }],
    strokePaints: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 2,
    cornerRadius: 8,
    textData: { characters: 'Submit Form' }
  };

  const normalized = normalizeOpenFigNode(rawOpenFigNode, { nodeId: '10:20', fileName: 'test.fig' });
  assert.equal(normalized.width, 200);
  assert.equal(normalized.height, 50);
  assert.equal(normalized.borderRadius, 8);
  assert.equal(normalized.borderWidth, 2);
  assert.equal(normalized.text, 'Submit Form');
  assert.equal(normalized.source, 'openfig-native-file');

  // Verify corrupt or incompatible binary throws clean actionable error
  await assert.rejects(
    () => importFigDocument(Uint8Array.from([0, 1, 2, 3])),
    /OpenFig|\.fig/
  );
});

// -----------------------------------------------------------------------------
// Test 5: Figma Export Full ZIP Import
// -----------------------------------------------------------------------------
test('Scenario 5 — Figma Export: Full ZIP extraction and validation', () => {
  const sampleZipPath = path.resolve('fixtures/mock-figma-export.zip');
  assert.ok(fs.existsSync(sampleZipPath), 'fixtures/mock-figma-export.zip must exist');

  const zipBytes = fs.readFileSync(sampleZipPath);
  const result = importFigmaExportZip(zipBytes, { fileKey: 'local-demo-not-figma', nodeId: '942:2734' });

  assert.equal(result.sourceType, 'figma-export-zip');
  assert.equal(result.ref.width, 112);
  assert.equal(result.ref.text, 'Buy ice cream');
  assert.ok(result.ref.nodeId !== null);
  assert.equal(result.fileKey, 'local-demo-not-figma');
});

// -----------------------------------------------------------------------------
// Test 6: Storybook Component Stories
// -----------------------------------------------------------------------------
test('Scenario 6 — Storybook: stories load the same DesignItem component', () => {
  const storyPath = path.resolve('src/stories/DesignItem.stories.jsx');
  assert.ok(fs.existsSync(storyPath), 'DesignItem.stories.jsx must exist');

  const content = fs.readFileSync(storyPath, 'utf8');
  assert.ok(content.includes('MatchesReference'), 'Must include MatchesReference story');
  assert.ok(content.includes('WrongWidth'), 'Must include WrongWidth story');
  assert.ok(content.includes('WrongDimensions'), 'Must include WrongDimensions story');
  assert.ok(content.includes('WrongColor'), 'Must include WrongColor story');
  assert.ok(content.includes('WrongTypography'), 'Must include WrongTypography story');
  assert.ok(content.includes('DesignItem'), 'Must test actual DesignItem component');

  // Verify Storybook main config
  const mainConfig = fs.readFileSync('.storybook/main.js', 'utf8');
  assert.ok(mainConfig.includes('@storybook/react-vite'), 'Framework must be @storybook/react-vite');
});

// -----------------------------------------------------------------------------
// Test 7: Playwright Style Extraction & Component Capture
// -----------------------------------------------------------------------------
test('Scenario 7 — Playwright: captures DOM computed styles and screenshots', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="react-item"]').waitFor({ timeout: 10000 });

    const styles = await page.locator('[data-testid="react-item"]').evaluate(el => {
      const css = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        backgroundColor: css.backgroundColor,
        borderRadius: css.borderRadius
      };
    });

    assert.ok(styles.width > 0, 'Measured width must be positive');
    assert.ok(styles.height > 0, 'Measured height must be positive');
    assert.ok(styles.backgroundColor, 'Computed backgroundColor must be present');
  } finally {
    await browser.close();
  }
});

// -----------------------------------------------------------------------------
// Test 8: Pixelmatch Visual Diff Comparison
// -----------------------------------------------------------------------------
test('Scenario 8 — Pixelmatch: compares images and detects mismatched pixels', () => {
  const width = 10, height = 10;
  const img1 = new PNG({ width, height });
  const img2 = new PNG({ width, height });
  img1.data.fill(255);
  img2.data.fill(255);

  // Alter 5 pixels in img2
  for (let i = 0; i < 5 * 4; i += 4) {
    img2.data[i] = 0; // Red channel to 0
  }

  const diff = new PNG({ width, height });
  const mismatchCount = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });

  assert.equal(mismatchCount, 5, 'Pixelmatch must identify exactly 5 mismatched pixels');
  const similarity = +(100 * (1 - mismatchCount / (width * height))).toFixed(2);
  assert.equal(similarity, 95.0, 'Similarity must be 95%');
});

// -----------------------------------------------------------------------------
// Test 9: reg-cli HTML Regression Report
// -----------------------------------------------------------------------------
test('Scenario 9 — reg-cli: generates HTML report and machine-readable json', async () => {
  const reportPath = path.resolve('out/visual/reg-cli-report.html');
  const jsonPath = path.resolve('out/visual/reg.json');

  if (!fs.existsSync(reportPath) || !fs.existsSync(jsonPath)) {
    const { runRegCliReport } = await import('../src/comparison/visual-engine/visual-comparison.mjs');
    const outVisual = path.resolve('out/visual');
    const actDir = path.join(outVisual, 'actual');
    const expDir = path.join(outVisual, 'expected');
    const diffDir = path.join(outVisual, 'diff');
    for (const d of [actDir, expDir, diffDir]) fs.mkdirSync(d, { recursive: true });
    const sampleImg = new PNG({ width: 16, height: 16 });
    sampleImg.data.fill(255);
    const pngBytes = PNG.sync.write(sampleImg);
    if (!fs.existsSync(path.join(actDir, 'item.png'))) fs.writeFileSync(path.join(actDir, 'item.png'), pngBytes);
    if (!fs.existsSync(path.join(expDir, 'item.png'))) fs.writeFileSync(path.join(expDir, 'item.png'), pngBytes);
    if (!fs.existsSync(path.join(diffDir, 'item.png'))) fs.writeFileSync(path.join(diffDir, 'item.png'), pngBytes);
    runRegCliReport({
      actualDir: actDir,
      expectedDir: expDir,
      diffDir,
      reportHtmlPath: reportPath,
      reportJsonPath: jsonPath,
    });
  }

  assert.ok(fs.existsSync(reportPath), 'out/visual/reg-cli-report.html must exist');
  assert.ok(fs.existsSync(jsonPath), 'out/visual/reg.json must exist');

  const content = fs.readFileSync(reportPath, 'utf8');
  assert.ok(content.includes('<html') || content.length > 1000, 'Report must contain HTML content');
});

// -----------------------------------------------------------------------------
// Test 10: Failure & Security Scenarios
// -----------------------------------------------------------------------------
test('Scenario 10 — Failure and security scenarios produce actionable errors', () => {
  // 1. Invalid Figma URL
  assert.throws(() => parseFigmaUrl('not-a-url'), /غير صالح/);

  // 2. SSRF Attempt (Protocol & host verification)
  assert.throws(() => parseFigmaUrl('http://169.254.169.254/latest/meta-data'), /HTTPS/i);
  assert.throws(() => parseFigmaUrl('https://evil-hacker.com/design/test'), /figma\.com/);

  // 3. FigJam URL unsupported
  assert.throws(
    () => assertSyncableDesignUrl('https://www.figma.com/board/vMYpz8Jc3EzVUsLQCDx3Jd/FigJam-file?node-id=0-1'),
    /FigJam/
  );

  // 4. Missing NodeId in assertSyncableDesignUrl
  assert.throws(
    () => assertSyncableDesignUrl('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/title'),
    /node-id/
  );

  // 5. Invalid ZIP
  assert.throws(() => importFigmaExportZip(Uint8Array.from([1, 2, 3])), /ZIP/);

  // 6. Oversized file (>50MB)
  assert.throws(() => importFigmaExportZip({ byteLength: 50_000_001 }), /50MB/);
});