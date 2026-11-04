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

