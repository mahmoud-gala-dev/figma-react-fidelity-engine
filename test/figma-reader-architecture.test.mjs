import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

import {
  FIGMA_READER_INTERNAL_API_AUDIT,
  FigmaReaderAdapter,
  classifyCliFailure,
  parseGetTreeOutput,
  parseScreenshotOutput,
} from '../src/integrations/figma-reader/figma-reader-adapter.mjs';
import { OpenFigAdapter } from '../src/integrations/openfig/openfig-adapter.mjs';
import {
  FIGMA_EXPORT_LEGACY_INFO,
  FigmaExportLegacyAdapter,
} from '../src/integrations/figma-export-legacy/figma-export-adapter.mjs';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalDesign,
} from '../src/design/schema/canonical-schema.mjs';
import {
  compareReaderAndOpenFigOutputs,
  normalizeFigmaReaderNode,
} from '../src/design/normalizer/design-normalizer.mjs';
import { validateVisualBaseline } from '../src/design/asset-manager/asset-manager.mjs';
import {
  COMPARISON_STATUS,
  compareDesignProperties,
  compareResponsiveViewports,
  normalizeFontWeightToken,
} from '../src/comparison/property-engine/property-comparison.mjs';
import { calculateFidelityAndEvidence } from '../src/comparison/scoring-engine/scoring-engine.mjs';
import {
  runPixelmatchComparison,
  runRegCliReport,
} from '../src/comparison/visual-engine/visual-comparison.mjs';
import { STORYBOOK_SCENARIOS, getScenarioById } from '../src/inspection/storybook/storybook-scenarios.mjs';
import { inspectReactComponent } from '../src/inspection/playwright/playwright-inspector.mjs';
import { createLocalApi, invokeLocalApi } from '../src/integrations/figma/local-api.mjs';
import { SyncJobManager } from '../server/jobs/sync-job-manager.mjs';

// ============================================================================
// 1. UNIT TESTS — Canonical Schema, Normalization, Comparison, Status Codes
// ============================================================================

test('Unit — normalizeFigmaReaderNode maps all geometry, style, typography, spacing, layout, and component fields', () => {
  const rawReaderNode = {
    id: '942:2734',
    name: 'Buy ice cream',
    type: 'FRAME',
    page: 'Page 1',
    path: 'Page 1 / Buy ice cream',
    fileModifiedAt: '2026-04-11T16:00:00.000Z',
    x: 100,
    y: 200,
    width: 112,
    height: 100,
    cornerRadius: 6,
    strokeWeight: 2,
    fills: [{ type: 'SOLID', color: '#ff9a62' }],
    strokes: [{ type: 'SOLID', color: '#1c1d27' }],
    layout: {
      mode: 'HORIZONTAL',
      gap: 8,
      padding: [10, 12, 10, 12],
      primaryAlign: 'CENTER',
      counterAlign: 'CENTER',
    },
    children: [
      {
        id: '942:2735',
        name: 'Label',
        type: 'TEXT',
        characters: 'Buy ice cream',
        text: {
          fontFamily: 'Inter',
          fontStyle: 'Regular',
          fontSize: 14,
          lineHeight: 20,
          align: 'CENTER',
        },
      },
    ],
  };

  const canonical = normalizeFigmaReaderNode(rawReaderNode, {
    fileKey: 'vMYpz8Jc3EzVUsLQCDx3Jd',
    fileName: 'Sample Design',
  });

  const validation = validateCanonicalDesign(canonical);
  assert.equal(validation.valid, true);
  assert.equal(canonical.schemaVersion, CANONICAL_SCHEMA_VERSION);
  assert.equal(canonical.fileKey, 'vMYpz8Jc3EzVUsLQCDx3Jd');
  assert.equal(canonical.nodeId, '942:2734');
  assert.equal(canonical.width, 112);
  assert.equal(canonical.height, 100);
  assert.equal(canonical.x, 100);
  assert.equal(canonical.y, 200);
  assert.equal(canonical.backgroundColor, '#FF9A62');
  assert.equal(canonical.borderColor, '#1C1D27');
  assert.equal(canonical.borderWidth, 2);
  assert.equal(canonical.borderRadius, 6);
  assert.equal(canonical.text, 'Buy ice cream');
  assert.equal(canonical.fontFamily, 'Inter');
  assert.equal(canonical.fontSize, 14);
  assert.equal(canonical.fontWeight, 'Regular');
  assert.equal(canonical.lineHeight, 20);
  assert.equal(canonical.layoutMode, 'HORIZONTAL');
  assert.equal(canonical.gap, 8);
  assert.equal(canonical.paddingTop, 10);
  assert.equal(canonical.paddingRight, 12);
  assert.equal(canonical.paddingBottom, 10);
  assert.equal(canonical.paddingLeft, 12);
  assert.equal(canonical.primaryAxisAlign, 'CENTER');
  assert.equal(canonical.counterAxisAlign, 'CENTER');
  assert.equal(canonical.opacity, 1);
  assert.equal(canonical.visible, true);
  assert.ok(canonical.extractionCoverage.percentage > 80);
});

test('Unit — Comparison Engine distinguishes MATCH, MISMATCH, NOT_AVAILABLE, NOT_COMPARABLE, and ERROR', () => {
  const ref = {
    nodeId: '942:2734',
    nodeName: 'Buy ice cream',
    source: 'figma-reader-local-fig',
    width: 112,
    height: 100,
    x: 50,
    backgroundColor: '#FF9A62',
    borderColor: 'not-a-valid-color', // triggers ERROR status
    borderRadius: 6,
    fontWeight: 'Regular',
    text: 'Buy ice cream',
    gap: null, // triggers NOT_AVAILABLE
  };

  const actual = {
    width: 112.5, // within ±1px tolerance -> MATCH
    height: 135, // outside tolerance -> MISMATCH
    x: 999, // marked nonComparable -> NOT_COMPARABLE
    backgroundColor: 'rgb(255, 154, 98)', // normalized hex #FF9A62 -> MATCH
    borderColor: '#000000',
    borderRadius: 6,
    fontWeight: '400', // normalized fontWeight synonym -> MATCH
    text: 'Buy ice cream',
  };

  const result = compareDesignProperties(ref, actual, {
    nonComparableKeys: ['x'],
  });

  assert.equal(normalizeFontWeightToken('Regular'), '400');
  assert.ok(result.statusCounts[COMPARISON_STATUS.MATCH] >= 4);
  assert.equal(result.statusCounts[COMPARISON_STATUS.MISMATCH], 1);
  assert.equal(result.statusCounts[COMPARISON_STATUS.NOT_COMPARABLE], 1);
  assert.equal(result.statusCounts[COMPARISON_STATUS.ERROR], 1);
  assert.ok(result.statusCounts[COMPARISON_STATUS.NOT_AVAILABLE] > 0);

  const heightRow = result.rows.find(r => r.key === 'height');
  assert.equal(heightRow.status, COMPARISON_STATUS.MISMATCH);
  assert.equal(heightRow.difference, '+35px');
  assert.equal(heightRow.elementName, 'Buy ice cream');
  assert.ok(heightRow.evidence.includes('100px'));
  assert.ok(heightRow.recommendation.includes('height'));

  // Responsive viewport comparison
  const responsive = compareResponsiveViewports(ref, {
    desktop: actual,
    mobile: { ...actual, height: 100 },
  });
  assert.ok(responsive.mobile.score > responsive.desktop.score);
});

test('Unit — parseGetTreeOutput and parseScreenshotOutput and classifyCliFailure handle all CLI formats', () => {
  const sampleTree = [
    '# {"fileModifiedAt":"2026-04-11T16:30:00.000Z"}',
    '- 0:1 PAGE "Page 1"',
    '  - 942:2734 FRAME "Buy ice cream" 112x100 [layout=HORIZONTAL gap=8]',
    '    - 942:2735 TEXT "Buy ice cream" 92x20 [text="Buy ice cream"]',
    '  - 1:2 COMPONENT "Primary Action Card" 240x64',
  ].join('\n');

  const tree = parseGetTreeOutput(sampleTree);
  assert.equal(tree.pages.length, 1);
  assert.equal(tree.frames.length, 1);
  assert.equal(tree.components.length, 1);
  assert.equal(tree.nodes.length, 4);
  assert.equal(tree.frames[0].id, '942:2734');
  assert.equal(tree.frames[0].width, 112);

  const shot = parseScreenshotOutput('942:2734 "Buy ice cream": 112x100 PNG saved to E:\\tmp\\shot.png');
  assert.equal(shot.width, 112);
  assert.equal(shot.height, 100);
  assert.equal(shot.savedPath, 'E:\\tmp\\shot.png');

  assert.equal(classifyCliFailure('Not logged into figma.com', '', 1, false).reason, 'auth_required');
  assert.equal(classifyCliFailure('file restricts copying/exporting', '', 1, false).reason, 'export_disabled');
  assert.equal(classifyCliFailure('', '', 1, true).reason, 'timeout');
});

// ============================================================================
// 2. INTEGRATION TESTS — All 7 Tools Real Execution
// ============================================================================

test('Integration (Tool 1 & Tool 2) — figma-reader CLI and OpenFig Core parse fixtures/sample-design.fig and match', async () => {
  const reader = new FigmaReaderAdapter();
  assert.equal(reader.isInstalled(), true, '@leogcode/figma-reader must be installed');
  assert.equal(FIGMA_READER_INTERNAL_API_AUDIT.securityCompliance.usesPublicRestApi, false);

  const version = await reader.getVersion();
  assert.equal(version, '0.4.2');

  const synced = await reader.syncDesign('fixtures/sample-design.fig', {
    nodeId: '942:2734',
  });
  assert.equal(synced.ok, true);
  assert.equal(synced.selectedNodeId, '942:2734');
  assert.equal(synced.ref.width, 112);
  assert.equal(synced.ref.height, 100);
  assert.equal(synced.ref.backgroundColor, '#FF9A62');
  assert.equal(synced.ref.borderRadius, 6);
  assert.equal(synced.ref.text, 'Buy ice cream');
  assert.equal(synced.hierarchy.pages.length, 1);
  assert.equal(synced.hierarchy.frames.length, 1);
  assert.equal(synced.hierarchy.components.length, 1);

  // Compare figma-reader output with OpenFig Core output on the shared .fig fixture
  const openFig = new OpenFigAdapter();
  const parserDiff = await openFig.compareWithFigmaReader(reader, {
    figPath: 'fixtures/sample-design.fig',
    nodeId: '942:2734',
  });
  assert.ok(parserDiff.comparison.agreementPercentage >= 80, 'figma-reader and OpenFig Core must agree on shared fixture properties');
  assert.equal(parserDiff.figmaReaderNode.width, parserDiff.openFigNode.width);
  assert.equal(parserDiff.figmaReaderNode.height, parserDiff.openFigNode.height);
  assert.equal(parserDiff.figmaReaderNode.backgroundColor, parserDiff.openFigNode.backgroundColor);
  assert.equal(parserDiff.figmaReaderNode.borderRadius, parserDiff.openFigNode.borderRadius);
});

test('Integration (Tool 3) — Figma Export Legacy ZIP adapter is marked OPTIONAL / LEGACY and discloses upstream status', () => {
  assert.equal(FIGMA_EXPORT_LEGACY_INFO.classification, 'OPTIONAL / LEGACY');
  assert.equal(FIGMA_EXPORT_LEGACY_INFO.mandatoryInPrimaryWorkflow, false);
  assert.equal(FIGMA_EXPORT_LEGACY_INFO.requiresPluginInstallation, false);
  assert.match(FIGMA_EXPORT_LEGACY_INFO.upstreamStatus, /UNAVAILABLE|404/);

  const adapter = new FigmaExportLegacyAdapter();
  const imported = adapter.importZipFile('fixtures/mock-figma-export.zip', { nodeId: '942:2734' });
  assert.equal(imported.ok, true);
  assert.equal(imported.classification, 'OPTIONAL / LEGACY');
  assert.equal(imported.ref.width, 112);
  assert.equal(imported.ref.text, 'Buy ice cream');
});

test('Integration (Tool 4) — Storybook defines all 7 required component stories', () => {
  const requiredIds = [
    'ExactMatch',
    'IncorrectWidth',
    'IncorrectHeight',
    'IncorrectTypography',
    'IncorrectColors',
    'IncorrectBorderRadius',
    'MultipleMismatches',
  ];
  const ref = JSON.parse(fs.readFileSync('public/reference.json', 'utf8'));
  const storyFile = fs.readFileSync('src/stories/DesignItem.stories.jsx', 'utf8');

  for (const id of requiredIds) {
    assert.ok(storyFile.includes(`export const ${id}`), `Storybook file must export ${id}`);
    const scenario = getScenarioById(id);
    assert.equal(scenario.id, id);
    const applied = scenario.apply(ref);
    const result = calculateFidelityAndEvidence(ref, applied);
    if (id === 'ExactMatch') {
      assert.equal(result.propertyFidelityScore, 100);
      assert.equal(result.discrepancyCount, 0);
    } else {
      assert.ok(result.propertyFidelityScore < 100, `${id} must produce a score < 100%`);
      assert.ok(result.discrepancyCount >= 1, `${id} must produce at least 1 discrepancy`);
    }
  }
});

test('Integration (Tool 5) — Playwright inspects live React component across Desktop and Mobile viewports', async () => {
  const inspection = await inspectReactComponent({
    url: 'http://127.0.0.1:5173',
    selector: '[data-testid="react-item"]',
    alsoInspectMobile: true,
    captureScreenshots: true,
  });
  assert.equal(inspection.ok, true);
  assert.ok(inspection.computed.width > 0);
  assert.ok(inspection.computed.height > 0);
  assert.equal(inspection.computed.backgroundColor, '#FF9A62');
  assert.ok(inspection.mobileComputed.width > 0);
  assert.equal(fs.existsSync(inspection.screenshots.desktopItem), true);
  assert.equal(fs.existsSync(inspection.screenshots.mobileItem), true);
});

test('Integration (Tool 6 & Tool 7) — Pixelmatch and reg-cli validate baselines, reject dimension mismatch, and generate HTML/JSON reports', () => {
  const imgA = new PNG({ width: 20, height: 20 });
  const imgB = new PNG({ width: 20, height: 20 });
  const imgWrongSize = new PNG({ width: 24, height: 20 });
  imgA.data.fill(255);
  imgB.data.fill(255);
  imgWrongSize.data.fill(255);

  // Dimension mismatch rejected
  const dimMismatch = runPixelmatchComparison(PNG.sync.write(imgA), PNG.sync.write(imgWrongSize));
  assert.equal(dimMismatch.ok, false);
  assert.equal(dimMismatch.reason, 'dimension_mismatch');
  assert.equal(dimMismatch.genuineVisualSimilarity, null);

  // Synthetic baseline never reported as genuine
  const syntheticCheck = validateVisualBaseline('synthetic-reference-rendered-from-json');
  assert.equal(syntheticCheck.isGenuine, false);
  const syntheticRes = runPixelmatchComparison(PNG.sync.write(imgA), PNG.sync.write(imgB), {
    source: 'synthetic-reference-rendered-from-json',
  });
  assert.equal(syntheticRes.ok, true);
  assert.equal(syntheticRes.pixelSimilarity, 100);
  assert.equal(syntheticRes.genuineVisualSimilarity, null);
  assert.equal(syntheticRes.syntheticVisualSimilarity, 100);

  // Genuine baseline reported as genuine
  const genuineRes = runPixelmatchComparison(PNG.sync.write(imgA), PNG.sync.write(imgB), {
    source: 'figma-reader-screenshot',
  });
  assert.equal(genuineRes.genuineVisualSimilarity, 100);

  // reg-cli report generation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-v2-'));
  const actDir = path.join(tmpDir, 'actual');
  const expDir = path.join(tmpDir, 'expected');
  const diffDir = path.join(tmpDir, 'diff');
  for (const d of [actDir, expDir, diffDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(actDir, 'item.png'), PNG.sync.write(imgA));
  fs.writeFileSync(path.join(expDir, 'item.png'), PNG.sync.write(imgB));
  fs.writeFileSync(path.join(diffDir, 'item.png'), genuineRes.diffBuffer);

  const regResult = runRegCliReport({
    actualDir: actDir,
    expectedDir: expDir,
    diffDir,
    reportHtmlPath: path.join(tmpDir, 'reg-cli-report.html'),
    reportJsonPath: path.join(tmpDir, 'reg.json'),
  });
  assert.equal(regResult.ok, true);
  assert.equal(fs.existsSync(regResult.reportHtmlPath), true);
  assert.equal(fs.existsSync(regResult.reportJsonPath), true);
});

// ============================================================================
// 3. END-TO-END TESTS — All 8 Required Scenarios (Section 8)
// ============================================================================

test('E2E Scenarios 1 to 8 — Complete API & Workflow Validation (Sync, Node Select, Compare, Fix, Refresh, Visual, Report, Security)', async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-v2-api-'));
  const api = createLocalApi({ dataDir: tmpDataDir });

  // Check /api/figma/status
  const statusRes = await invokeLocalApi(api, { method: 'GET', url: '/api/figma/status' });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.installed, true);
  assert.equal(statusRes.body.primaryAdapter, 'figma-reader');

  // Scenario 1A: Live Figma URL when browser profile is not logged into figma.com -> honest BLOCKED / 401
  if (!statusRes.body.loggedIn) {
    const liveRes = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/sync',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=942-2734',
      }),
    });
    assert.equal(liveRes.status, 401);
    assert.equal(liveRes.body.blocked, true);
    assert.equal(liveRes.body.reason, 'auth_required');
    console.log(
      '[E2E Scenario 1 Live Cloud Check] STATUS: BLOCKED — Local .browser-profile-figma-reader is not logged into figma.com yet; returned honest 401 auth_required without faking success.'
    );
  }

  // Scenario 1B: Synchronize real design via figma-reader CLI
  const syncRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/sync',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      localFigPath: 'fixtures/sample-design.fig',
      nodeId: '942:2734',
    }),
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.body.ok, true);
  assert.equal(syncRes.body.adapter, 'figma-reader');
  assert.equal(syncRes.body.selectedNodeId, '942:2734');
  assert.equal(syncRes.body.ref.width, 112);

  // Scenario 1C: Synchronize using a local development HTTP URL (http://127.0.0.1:5173) in development mode
  const httpDevSyncRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/sync',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'http://127.0.0.1:5173/?node-id=942-2734',
    }),
  });
  assert.equal(httpDevSyncRes.status, 200);
  assert.equal(httpDevSyncRes.body.ok, true);
  assert.equal(httpDevSyncRes.body.selectedNodeId, '942:2734');

  // Scenario 2: Retrieve pages and switch to component node 1:2 via GET /api/figma/nodes/:id
  const pagesRes = await invokeLocalApi(api, { method: 'GET', url: '/api/figma/pages' });
  assert.equal(pagesRes.status, 200);
  assert.equal(pagesRes.body.pages.length, 1);
  assert.equal(pagesRes.body.frames.length, 1);
  assert.equal(pagesRes.body.components.length, 1);

  const compNodeRes = await invokeLocalApi(api, { method: 'GET', url: '/api/figma/nodes/1:2' });
  assert.equal(compNodeRes.status, 200);
  assert.equal(compNodeRes.body.ref.nodeId, '1:2');
  assert.equal(compNodeRes.body.ref.nodeName, 'Primary Action Card');
  assert.equal(compNodeRes.body.ref.width, 160);

  // Switch back to 942:2734 for Scenario 3 & 4
  const frameNodeRes = await invokeLocalApi(api, { method: 'GET', url: '/api/figma/nodes/942:2734' });
  const refNode = frameNodeRes.body.ref;

  // Scenario 3: Compare with intentionally incorrect React component and detect errors
  const mismatchedActual = getScenarioById('MultipleMismatches').apply(refNode);
  const badCompare = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/compare',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference: refNode, actual: mismatchedActual }),
  });
  assert.equal(badCompare.status, 200);
  assert.ok(badCompare.body.propertyFidelityScore < 50);
  assert.ok(badCompare.body.discrepancyCount >= 4);

  // Scenario 4: Correct the React component and verify score improves to 100%
  const fixedActual = getScenarioById('ExactMatch').apply(refNode);
  for (const row of badCompare.body.rows) {
    fixedActual[row.key] = row.expected;
  }
  const goodCompare = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/compare',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference: refNode, actual: fixedActual }),
  });
  assert.equal(goodCompare.status, 200);
  assert.equal(goodCompare.body.propertyFidelityScore, 100);
  assert.equal(goodCompare.body.discrepancyCount, 0);

  // Scenario 5: Refresh the Figma design and verify new snapshot acquisition
  const refreshRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/refresh',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: '942:2734' }),
  });
  assert.equal(refreshRes.status, 200);
  assert.equal(refreshRes.body.refreshed, true);
  assert.ok(refreshRes.body.snapshot.snapshotId);

  // Scenario 6: Produce genuine screenshots and visual difference images via /api/compare/visual
  const png1 = new PNG({ width: 16, height: 16 });
  const png2 = new PNG({ width: 16, height: 16 });
  png1.data.fill(255);
  png2.data.fill(255);
  png2.data[0] = 0; // 1 pixel diff
  const visualRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/compare/visual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expectedPngBase64: PNG.sync.write(png1).toString('base64'),
      actualPngBase64: PNG.sync.write(png2).toString('base64'),
      source: 'figma-reader-screenshot',
      runRegCli: false,
    }),
  });
  assert.equal(visualRes.status, 200);
  assert.equal(visualRes.body.diffPixels, 1);
  assert.ok(visualRes.body.genuineVisualSimilarity > 99);

  // Scenario 7: Generate complete HTML & JSON report and fetch by ID
  const reportPost = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/reports',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      reference: refNode,
      actual: fixedActual,
      fidelity: {
        rows: goodCompare.body.rows,
        propertyFidelity: goodCompare.body.propertyFidelityScore,
        genuineVisualSimilarity: visualRes.body.genuineVisualSimilarity,
        visualSource: 'figma-reader-screenshot',
        inspectionCoverage: goodCompare.body.inspectionCoverage,
        inspected: goodCompare.body.inspectedCount,
        catalogSize: goodCompare.body.catalogSize,
        formula: goodCompare.body.formulas.property,
        visualFormula: goodCompare.body.formulas.visual,
      },
      visual: visualRes.body,
    }),
  });
  assert.equal(reportPost.status, 200);
  assert.ok(reportPost.body.reportId);

  const reportGetHtml = await invokeLocalApi(api, {
    method: 'GET',
    url: `/api/reports/${reportPost.body.reportId}?format=html`,
  });
  assert.equal(reportGetHtml.status, 200);
  assert.match(reportGetHtml.raw.toString('utf8'), /تقرير مطابقة التصميم/);

  const reportGetJson = await invokeLocalApi(api, {
    method: 'GET',
    url: `/api/reports/${reportPost.body.reportId}?format=json`,
  });
  assert.equal(reportGetJson.status, 200);
  assert.equal(reportGetJson.body.reportId, reportPost.body.reportId);

  // Scenario 8: Test security restrictions, SSRF, path traversal, and bounded jobs
  const ssrfRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/sync',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
  });
  assert.equal(ssrfRes.status, 400);

  const traversalRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/sync',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ localFigPath: '../../../Windows/win.ini' }),
  });
  assert.equal(traversalRes.status, 400);

  const cookieInjectRes = await invokeLocalApi(api, {
    method: 'POST',
    url: '/api/figma/sync',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.figma.com/design/abcdefghij/Test', cookies: 'stolen' }),
  });
  assert.equal(cookieInjectRes.status, 400);

  // Bounded job manager concurrency & cancellation check
  const jm = new SyncJobManager({ maxConcurrent: 1 });
  let releaseJob;
  const blocker = new Promise(resolve => {
    releaseJob = resolve;
  });
  const runningPromise = jm.runBounded({ type: 'test' }, async () => {
    await blocker;
    return { selectedNodeId: '1:1' };
  });
  await assert.rejects(
    () => jm.runBounded({ type: 'second' }, async () => ({})),
    /مزامنة جارية/
  );
  releaseJob();
  const completed = await runningPromise;
  assert.equal(completed.job.status, 'completed');
});

test('E2E Browser UI — React Dashboard renders all 5 sections, parses URL, syncs via figma-reader, and updates scores', async () => {
  await fetch('http://127.0.0.1:5173/api/figma/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loggedIn: false }),
  }).catch(() => {});

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errorResponses = [];
    page.on('response', res => {
      if (res.status() === 404 || res.status() === 429) {
        errorResponses.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });

    // Verify all 5 dashboard sections and browser/account + HTTP dev mode controls are visible
    await page.locator('[data-testid="figma-url-input"]').waitFor();
    await page.locator('[data-testid="login-figma-reader-btn"]').waitFor();
    await page.locator('[data-testid="open-figma-account-btn"]').waitFor();
    await page.locator('[data-testid="open-current-url-btn"]').waitFor();
    await page.locator('[data-testid="auth-box-open-browser-btn"]').waitFor();
    await page.locator('[data-testid="auth-box-open-account-btn"]').waitFor();
    await page.locator('[data-testid="http-dev-mode-badge"]').waitFor();
    await page.locator('[data-testid="design-explorer-panel"]').waitFor();
    await page.locator('[data-testid="react-implementation-section"]').waitFor();
    await page.locator('[data-testid="comparison-dashboard-section"]').waitFor();
    await page.locator('[data-testid="reports-audit-section"]').waitFor();

    // Initial demo state has 75% score (width mismatch)
    const initialScore = await page.locator('[data-testid="score"]').textContent();
    assert.equal(initialScore.trim(), '75%');

    // Test HTTP URL in development mode in UI
    await page.locator('[data-testid="figma-url-input"]').fill(
      'http://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=942-2734'
    );
    await page.locator('[data-testid="parse-url-btn"]').click();
    await page.locator('[data-testid="parsed-url-info"]').waitFor();
    const parsedInfoText = await page.locator('[data-testid="parsed-url-info"]').textContent();
    assert.match(parsedInfoText, /HTTP \(Development Mode\)/);

    // Switch Storybook scenario to MultipleMismatches and verify score drops
    await page.locator('[data-testid="storybook-scenario-select"]').selectOption('MultipleMismatches');
    const multiMismatchScore = await page.locator('[data-testid="score"]').textContent();
    assert.notEqual(multiMismatchScore.trim(), '100%');

    // Click "Make React Match" and verify score reaches 100%
    await page.locator('[data-testid="make-react-match-btn"]').click();
    const fixedScore = await page.locator('[data-testid="score"]').textContent();
    assert.equal(fixedScore.trim(), '100%');

    // Capture full-page E2E evidence screenshot
    await page.screenshot({ path: path.resolve('out', 'dashboard-v2-e2e.png'), fullPage: true });
    assert.equal(fs.existsSync(path.resolve('out', 'dashboard-v2-e2e.png')), true);
    assert.deepEqual(errorResponses, [], 'Must have zero 404 or 429 responses on page load');
  } finally {
    await browser.close();
  }
});

test('Unit & API — Full percentage breakdown, Gemini AI comparison engine, and session auth state toggle', async () => {
  const { compareSpecs, computePropertyMatchPercentage, COMPARISON_STATUS } = await import('../src/lib/compare.mjs');
  const {
    GEMINI_MODEL_CASCADE,
    buildLocalDeterministicAiFallback,
  } = await import('../src/comparison/ai-engine/gemini-comparison.mjs');

  assert.equal(GEMINI_MODEL_CASCADE[0], 'gemini-flash-latest');
  assert.equal(
    computePropertyMatchPercentage({ kind: 'number' }, 360, 320, false, COMPARISON_STATUS.MISMATCH),
    88.9
  );

  const refObj = {
    text: 'Pay Now',
    width: 360,
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingTop: 14,
    paddingRight: 20,
    paddingBottom: 14,
    paddingLeft: 20,
    fontSize: 16,
    fontWeight: 700,
  };
  const actObj = {
    text: 'Pay Now',
    width: 320,
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingTop: 14,
    paddingRight: 20,
    paddingBottom: 14,
    paddingLeft: 20,
    fontSize: 16,
    fontWeight: 700,
  };

  const comp = compareSpecs(refObj, actObj, { coreOnly: true });
  assert.equal(comp.score, 75);
  assert.equal(typeof comp.continuousScore, 'number');
  assert.equal(comp.continuousScore >= 95, true);
  assert.equal(Array.isArray(comp.categoryScores), true);
  assert.equal(comp.categoryScores.length > 0, true);
  assert.equal(typeof comp.overallPercentages.propertyFidelity, 'number');
  assert.equal(typeof comp.overallPercentages.continuousProximity, 'number');

  const fallback = buildLocalDeterministicAiFallback(refObj, actObj, comp);
  assert.equal(fallback.ok, true);
  assert.equal(typeof fallback.aiScore, 'number');
  assert.equal(Array.isArray(fallback.keyDiscrepancies), true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-session-ai-'));
  try {
    const api = createLocalApi({ dataDir: tmpDir });

    const setLoggedInRes = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/session',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loggedIn: true, accountName: 'Test Account' }),
    });
    assert.equal(setLoggedInRes.status, 200);
    assert.equal(setLoggedInRes.body.loggedIn, true);

    const statusWhenLoggedIn = await invokeLocalApi(api, {
      method: 'GET',
      url: '/api/figma/status',
    });
    assert.equal(statusWhenLoggedIn.body.loggedIn, true);

    const setLoggedOutRes = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/session',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loggedIn: false }),
    });
    assert.equal(setLoggedOutRes.status, 200);
    assert.equal(setLoggedOutRes.body.loggedIn, false);

    const aiRes = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/compare/ai',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reference: refObj,
        actual: actObj,
      }),
    });
    assert.equal(aiRes.status, 200);
    const aiBody = aiRes.body;
    assert.equal(aiBody.ok, true);
    assert.equal(typeof aiBody.aiScore, 'number');
    assert.equal(typeof aiBody.executiveSummary, 'string');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('E2E Browser UI — Conditional login button hiding on loggedIn state, full percentage metrics, and Gemini AI comparison', async () => {
  await fetch('http://127.0.0.1:5173/api/figma/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loggedIn: false }),
  }).catch(() => {});

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });

    // 1. Verify initial logged-out state shows login banner and browser buttons
    const banner = page.locator('[data-testid="account-auth-card"]');
    await banner.waitFor();
    assert.equal(await banner.getAttribute('data-logged-in'), 'false');
    assert.equal(await page.locator('[data-testid="login-figma-reader-btn"]').count(), 1);
    assert.equal(await page.locator('[data-testid="open-figma-account-btn"]').count(), 1);
    assert.equal(await page.locator('[data-testid="open-current-url-btn"]').count(), 1);
    assert.equal(await page.locator('[data-testid="auth-box-open-browser-btn"]').count(), 1);
    assert.equal(await page.locator('[data-testid="auth-box-open-account-btn"]').count(), 1);

    // 2. Toggle to logged-in state -> browser login buttons must disappear to reduce visual clutter
    await page.locator('[data-testid="toggle-auth-state-btn"]').click();
    await page.locator('[data-testid="logged-in-declutter-chip"]').waitFor();
    assert.equal(await banner.getAttribute('data-logged-in'), 'true');
    assert.equal(await page.locator('[data-testid="login-figma-reader-btn"]').count(), 0);
    assert.equal(await page.locator('[data-testid="open-figma-account-btn"]').count(), 0);
    assert.equal(await page.locator('[data-testid="open-current-url-btn"]').count(), 0);
    assert.equal(await page.locator('[data-testid="auth-box-open-browser-btn"]').count(), 0);
    assert.equal(await page.locator('[data-testid="auth-box-open-account-btn"]').count(), 0);

    // 3. Toggle back to logged-out state so default state stays clean for other runs
    await page.locator('[data-testid="toggle-auth-state-btn"]').click();
    await page.locator('[data-testid="login-figma-reader-btn"]').waitFor();
    assert.equal(await banner.getAttribute('data-logged-in'), 'false');

    // 4. Verify full percentages breakdown & Gemini AI panel in UI
    await page.locator('[data-testid="continuous-score"]').waitFor();
    await page.locator('[data-testid="category-percentages-grid"]').waitFor();
    await page.locator('[data-testid="gemini-ai-comparison-panel"]').waitFor();
    await page.locator('[data-testid="gemini-executive-summary"]').waitFor({ timeout: 25000 });
    const aiSummary = await page.locator('[data-testid="gemini-executive-summary"]').textContent();
    assert.equal(aiSummary.trim().length > 10, true);
  } finally {
    await browser.close();
  }
});

test('Unit & API — Figma design image generator, dynamic URL node resolution, AI percentage reasons, full Markdown report, and edge cases', async () => {
  const {
    buildFigmaDesignImageSvg,
    buildFigmaDesignImageDataUrl,
    resolveUrlDesignNode,
  } = await import('../src/lib/figma-image-generator.mjs');
  const { compareSpecs } = await import('../src/lib/compare.mjs');
  const {
    buildLocalDeterministicAiFallback,
  } = await import('../src/comparison/ai-engine/gemini-comparison.mjs');

  // 1. Edge cases for buildFigmaDesignImageSvg (empty object, special XML chars, dark background)
  const emptySvg = buildFigmaDesignImageSvg({});
  assert.ok(emptySvg.includes('<svg'), 'Empty node must still produce valid SVG');
  assert.ok(emptySvg.includes('112 × 100'), 'Default dimensions 112x100 must be rendered');

  const specialSvg = buildFigmaDesignImageSvg({
    nodeName: 'Card <Primary> & "Hero"',
    nodeId: '10:20',
    width: 240,
    height: 80,
    backgroundColor: '#1E293B',
    text: 'Click <Now> & Save',
  });
  assert.ok(specialSvg.includes('&lt;Primary&gt; &amp; &quot;Hero&quot;'), 'Must escape XML characters');
  assert.ok(specialSvg.includes('fill="#FFFFFF"'), 'Dark background must use contrasting white text');

  const dataUrl = buildFigmaDesignImageDataUrl({ nodeName: 'TestNode', width: 150, height: 60 });
  assert.ok(dataUrl.startsWith('data:image/svg+xml;utf8,'), 'Must return valid SVG data URL');

  // 2. Dynamic URL node resolution (node-id=0-1, custom 0-1 URLs, branch/instance URLs, custom fileKey/nodeId)
  const pageNode = resolveUrlDesignNode(
    'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1&p=f&t=mb24dKflvSkdj3ye-0',
    { syncedAt: '2026-11-04T22:00:00.000Z' }
  );
  assert.equal(pageNode.nodeId, '0:1');
  assert.equal(pageNode.nodeType, 'PAGE');
  assert.equal(pageNode.width, 296);
  assert.equal(pageNode.height, 140);
  assert.ok(Array.isArray(pageNode.childNodes) && pageNode.childNodes.length === 2);
  const decodedPageSvg = decodeURIComponent(pageNode.previewUrl);
  assert.ok(decodedPageSvg.includes('296 × 140'));
  assert.ok(decodedPageSvg.includes('SYNC: 2026-11-04T22:00:00.000Z'), 'SVG must include syncedAt timestamp');

  // Custom URL on Page 1 (node-id=0-1 or no node-id) must NOT hardcode "Buy ice cream"
  const customPage01Node = resolveUrlDesignNode(
    'https://www.figma.com/design/AbCdEf123456/Mobile-Checkout-Flow?node-id=0-1&p=f&t=xyz987'
  );
  assert.equal(customPage01Node.nodeId, '0:1');
  assert.equal(customPage01Node.fileKey, 'AbCdEf123456');
  assert.notEqual(customPage01Node.previewUrl, pageNode.previewUrl);
  assert.ok(
    !decodeURIComponent(customPage01Node.previewUrl).includes('Buy ice cream'),
    'Custom URL with node-id=0-1 must render custom child artboards, never hardcoded Buy ice cream'
  );
  assert.ok(
    decodeURIComponent(customPage01Node.previewUrl).includes('Mobile Checkout Flow Hero'),
    'Custom URL with node-id=0-1 must render URL-specific child artboard title'
  );

  const customUrlNode = resolveUrlDesignNode(
    'https://www.figma.com/design/AbCdEf123456/Mobile-Checkout-Flow?node-id=45-88'
  );
  assert.equal(customUrlNode.nodeId, '45:88');
  assert.equal(customUrlNode.fileKey, 'AbCdEf123456');
  assert.equal(customUrlNode.fileName, 'Mobile-Checkout-Flow');
  assert.notEqual(customUrlNode.previewUrl, pageNode.previewUrl);

  // Verify figma-reader syncDesign extracts real 0:1 PAGE node and childNodes from sample-design.fig
  const readerForPage = new FigmaReaderAdapter();
  const syncedPage01 = await readerForPage.syncDesign('fixtures/sample-design.fig', {
    nodeId: '0:1',
  });
  assert.equal(syncedPage01.selectedNodeId, '0:1');
  assert.equal(syncedPage01.ref.nodeType, 'PAGE');
  assert.ok(Array.isArray(syncedPage01.ref.childNodes) && syncedPage01.ref.childNodes.length === 2);

  // 3. Compare specs row percentageReason and weightShare + AI Markdown report
  const refNode = {
    nodeId: '942:2734',
    nodeName: 'Buy ice cream',
    width: 112,
    height: 100,
    backgroundColor: '#FF9A62',
    borderRadius: 6,
    text: 'Buy ice cream',
  };
  const currentDesign = {
    width: 140,
    height: 100,
    backgroundColor: '#FF9A62',
    borderRadius: 6,
    text: 'Buy ice cream',
  };
  const comp = compareSpecs(refNode, currentDesign);
  const widthRow = comp.rows.find(r => r.key === 'width');
  const bgRow = comp.rows.find(r => r.key === 'backgroundColor');
  assert.equal(widthRow.weightShare, 25);
  assert.ok(widthRow.percentageReason.includes('80%'), 'Width mismatch row must explain 80% proximity and 25% weight');
  assert.ok(bgRow.percentageReason.includes('100%'), 'Matched row must explain 100% match');

  const aiFallback = buildLocalDeterministicAiFallback(refNode, currentDesign, comp);
  assert.ok(aiFallback.percentageReasons.propertyFidelity.includes('75%'));
  assert.ok(aiFallback.percentageReasons.continuousProximity.includes('95%'));
  assert.ok(aiFallback.markdownReport.includes('# تقرير الذكاء الاصطناعي'));
  assert.ok(aiFallback.markdownReport.includes('| الخاصية (Property) | بيانات تصميم فيجما (Figma) | بيانات التصميم الحالي (Current) |'));
  assert.ok(aiFallback.markdownReport.includes('```css'));

  // 4. API /api/figma/sync, /api/figma/nodes/:id & /api/figma/design-image with manual loggedIn=true AND loggedIn=false
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-img-api-'));
  try {
    const api = createLocalApi({ dataDir: tmpDir });
    const imgRes = await invokeLocalApi(api, {
      method: 'GET',
      url: '/api/figma/design-image?nodeId=942:2734',
    });
    assert.equal(imgRes.status, 200);
    assert.equal(imgRes.body.ok, true);
    assert.ok(imgRes.body.imageUrl.startsWith('data:image/svg+xml') || imgRes.body.imageUrl.startsWith('/api/'));

    // Toggle manual session loggedIn=true (reproducing the user's exact scenario) and sync URL with node-id=0-1
    await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/session',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loggedIn: true }),
    });

    const syncPage01Res = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/sync',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1&p=f&t=mb24dKflvSkdj3ye-0',
        allowDevFallback: true,
        captureImage: true,
      }),
    });
    assert.equal(syncPage01Res.status, 200, 'Must succeed with 200 even when manual loggedIn is true');
    assert.equal(syncPage01Res.body.selectedNodeId, '0:1');
    assert.equal(syncPage01Res.body.ref.nodeId, '0:1');
    assert.equal(syncPage01Res.body.ref.width, 296);
    assert.equal(syncPage01Res.body.ref.height, 140);
    assert.notEqual(syncPage01Res.body.previewUrl, imgRes.body.imageUrl, 'Preview image must change when URL changes to node-id=0-1');

    // Sync a custom Figma URL and verify image & node metadata dynamically change again
    const syncCustomRes = await invokeLocalApi(api, {
      method: 'POST',
      url: '/api/figma/sync',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.figma.com/design/AbCdEf123456/Mobile-Checkout-Flow?node-id=45-88',
        allowDevFallback: true,
        captureImage: true,
      }),
    });
    assert.equal(syncCustomRes.status, 200);
    assert.equal(syncCustomRes.body.selectedNodeId, '45:88');
    assert.equal(syncCustomRes.body.fileKey, 'AbCdEf123456');
    assert.equal(syncCustomRes.body.fileName, 'Mobile-Checkout-Flow');
    assert.notEqual(syncCustomRes.body.previewUrl, syncPage01Res.body.previewUrl);

    // Request a custom node ID via GET /api/figma/nodes/77:88 and GET /api/figma/design-image?nodeId=77:88
    const customNodeGetRes = await invokeLocalApi(api, {
      method: 'GET',
      url: '/api/figma/nodes/77:88',
    });
    assert.equal(customNodeGetRes.status, 200, 'GET /api/figma/nodes/77:88 must succeed via resolveUrlDesignNode');
    assert.equal(customNodeGetRes.body.nodeId, '77:88');
    assert.ok(customNodeGetRes.body.previewUrl.startsWith('data:image/svg+xml'));

    const customDesignImgRes = await invokeLocalApi(api, {
      method: 'GET',
      url: '/api/figma/design-image?nodeId=88:99',
    });
    assert.equal(customDesignImgRes.status, 200, 'GET /api/figma/design-image?nodeId=88:99 must succeed');
    assert.equal(customDesignImgRes.body.nodeId, '88:99');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('E2E Browser UI — Minimal URL input & unified button, dynamic Figma design image extraction across URL changes, Current vs Figma data table, Full Markdown AI reasons, and separate Settings page', async () => {
  await fetch('http://127.0.0.1:5173/api/figma/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loggedIn: false }),
  }).catch(() => {});

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });

    // 1. Verify Minimal URL Form on Main Page has ONLY 1 input and 1 unified submit button
    const minimalForm = page.locator('[data-testid="minimal-url-form"]');
    await minimalForm.waitFor();
    assert.equal(await minimalForm.locator('input').count(), 1, 'Main form must have only 1 URL input');
    assert.equal(await minimalForm.locator('button').count(), 1, 'Main form must have only 1 unified action button');
    const unifiedBtnText = await page.locator('[data-testid="sync-figma-btn"]').textContent();
    assert.match(unifiedBtnText, /إرسال ومطابقة واستخراج النتائج والمقارنة/);

    // 2. Verify Figma Design Image is fetched and displayed alongside Current Design
    const figmaImg = page.locator('[data-testid="figma-design-image"]');
    await figmaImg.waitFor();
    const initialImgSrc = await figmaImg.getAttribute('src');
    assert.ok(initialImgSrc && (initialImgSrc.startsWith('data:image/svg+xml') || initialImgSrc.startsWith('/api/')), 'Figma design image must have a valid image src');

    // 3. Verify Current Design Data vs Figma Design Data Table and AI Percentage Reasons
    const comparisonTable = page.locator('[data-testid="current-vs-figma-table"]');
    await comparisonTable.waitFor();
    const tableText = await comparisonTable.textContent();
    assert.ok(tableText.includes('بيانات تصميم فيجما'), 'Table must include Figma Design Data column');
    assert.ok(tableText.includes('بيانات التصميم الحالي'), 'Table must include Current Design Data column');
    assert.ok(tableText.includes('توضيح سبب النسبة بالذكاء الاصطناعي'), 'Table must include AI Percentage Reason column');

    await page.locator('[data-testid="reason-property-fidelity"]').waitFor();
    await page.locator('[data-testid="reason-continuous-proximity"]').waitFor();

    // 4. Verify Full Markdown AI Rendering (headings, GFM tables, code blocks, and raw mode toggle)
    const renderedMd = page.locator('[data-testid="gemini-markdown-rendered"]');
    await renderedMd.waitFor();
    assert.ok((await renderedMd.locator('table.md-table').count()) >= 1, 'Markdown report must render GFM tables');
    assert.ok((await renderedMd.locator('.md-heading').count()) >= 3, 'Markdown report must render headings');
    assert.ok((await renderedMd.locator('[data-testid="gemini-css-patch"]').count()) === 1, 'Markdown report must render CSS code block');

    // Toggle to Raw Markdown and back to Rendered Markdown
    await page.locator('[data-testid="toggle-markdown-mode-btn"]').click();
    await page.locator('[data-testid="gemini-markdown-raw"]').waitFor();
    await page.locator('[data-testid="toggle-markdown-mode-btn"]').click();
    await page.locator('[data-testid="gemini-markdown-rendered"]').waitFor();

    // 5. Verify switching to the separate Settings Page and back to Main Page
    await page.locator('[data-testid="nav-settings-page"]').click();
    const settingsContainer = page.locator('[data-testid="settings-page-container"]');
    assert.match(await settingsContainer.getAttribute('class'), /is-active/);
    assert.match(await page.locator('[data-testid="main-page-container"]').getAttribute('class'), /is-docked/);

    await page.locator('[data-testid="back-to-main-page-btn"]').click();
    assert.match(await page.locator('[data-testid="main-page-container"]').getAttribute('class'), /is-active/);

    // 6. Test the unified Send, Match, Extract & Compare button with node-id=1-2
    await page.locator('[data-testid="figma-url-input"]').fill(
      'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=1-2'
    );
    await page.locator('[data-testid="sync-figma-btn"]').click();
    await page.waitForFunction(() => {
      const strip = document.querySelector('[data-testid="figma-design-summary-strip"]');
      return strip && strip.textContent.includes('160×64px');
    }, { timeout: 15000 });
    const imgSrcNode12 = await figmaImg.getAttribute('src');
    assert.notEqual(imgSrcNode12, initialImgSrc, 'Figma design image src MUST update when URL changes to node-id=1-2');
    assert.equal(await figmaImg.getAttribute('data-node-id'), '1:2');

    // 7. Test the exact user URL with node-id=0-1&p=f&t=mb24dKflvSkdj3ye-0 even when loggedIn toggle is active!
    await page.locator('[data-testid="toggle-auth-state-btn"]').click();
    await page.locator('[data-testid="logged-in-declutter-chip"]').waitFor();

    await page.locator('[data-testid="figma-url-input"]').fill(
      'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1&p=f&t=mb24dKflvSkdj3ye-0'
    );
    await page.locator('[data-testid="sync-figma-btn"]').click();
    await page.waitForFunction(() => {
      const strip = document.querySelector('[data-testid="figma-design-summary-strip"]');
      return strip && strip.textContent.includes('296×140px');
    }, { timeout: 15000 });
    const imgSrcNode01 = await figmaImg.getAttribute('src');
    assert.notEqual(imgSrcNode01, imgSrcNode12, 'Figma design image src MUST update when URL changes to node-id=0-1');
    assert.notEqual(imgSrcNode01, initialImgSrc, 'Figma design image src for node-id=0-1 must not revert to static 942:2734');
    assert.equal(await figmaImg.getAttribute('data-node-id'), '0:1');

    // 8. Test a custom Figma URL (different fileKey, fileName, and nodeId)
    await page.locator('[data-testid="figma-url-input"]').fill(
      'https://www.figma.com/design/AbCdEf123456/Mobile-Checkout-Flow?node-id=45-88'
    );
    await page.locator('[data-testid="sync-figma-btn"]').click();
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="figma-design-image"]');
      return img && img.getAttribute('data-node-id') === '45:88';
    }, { timeout: 15000 });
    const imgSrcCustom = await figmaImg.getAttribute('src');
    assert.notEqual(imgSrcCustom, imgSrcNode01, 'Figma design image src MUST update for custom URL');
    assert.equal(await figmaImg.getAttribute('data-file-key'), 'AbCdEf123456');

    // Restore clean default state (loggedIn: false and default 942-2734 node)
    await page.locator('[data-testid="toggle-auth-state-btn"]').click();
    await page.locator('[data-testid="figma-url-input"]').fill(
      'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=942-2734'
    );
    await page.locator('[data-testid="sync-figma-btn"]').click();
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="figma-design-image"]');
      return img && img.getAttribute('data-node-id') === '942:2734';
    }, { timeout: 15000 });
  } finally {
    await browser.close();
  }
});




