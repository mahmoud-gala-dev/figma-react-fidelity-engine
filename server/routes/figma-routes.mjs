import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { inspectReactComponent } from '../../src/inspection/playwright/playwright-inspector.mjs';
import { runPixelmatchComparison, runRegCliReport } from '../../src/comparison/visual-engine/visual-comparison.mjs';

/**
 * Handles the approved 7-tool architecture routes (Section 6):
 * - GET  /api/figma/status
 * - POST /api/figma/login
 * - POST /api/figma/sync
 * - GET  /api/figma/pages
 * - GET  /api/figma/nodes/:id
 * - POST /api/figma/refresh
 * - POST /api/figma/inspect
 * - POST /api/figma/compare-parsers
 * - POST /api/compare
 * - POST /api/compare/visual
 * - POST /api/reports
 * - GET  /api/reports/:id
 */
export async function handleFigmaV2Routes({
  req,
  res,
  url,
  orchestrator,
  cwd,
  readBody,
  send,
  allow,
}) {
  const pathname = url.pathname;

  if (pathname === '/api/figma/status' && req.method === 'GET') {
    allow('dashboard', 'local');
    const status = await orchestrator.getStatus();
    send(200, status);
    return true;
  }

  if (pathname === '/api/figma/session' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 64_000)).toString('utf8') || '{}');
    const updatedStatus = await orchestrator.setSessionAuthState({
      loggedIn: body.loggedIn === null ? null : Boolean(body.loggedIn),
      email: typeof body.email === 'string' ? body.email.slice(0, 120) : null,
      accountName: typeof body.accountName === 'string' ? body.accountName.slice(0, 64) : null,
    });
    send(200, { ok: true, ...updatedStatus });
    return true;
  }

  if (pathname === '/api/figma/login' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 64_000)).toString('utf8') || '{}');
    const waitSeconds = typeof body.waitSeconds === 'number' ? body.waitSeconds : 0;
    const result = await orchestrator.login({
      waitSeconds,
      url: body.url || null,
      mode: body.mode || 'login',
    });
    send(result.ok ? 200 : 422, result);
    return true;
  }

  if (pathname === '/api/figma/open-browser' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 64_000)).toString('utf8') || '{}');
    const result = await orchestrator.openBrowser({
      url: body.url || null,
      mode: body.mode || 'account',
    });
    send(result.ok ? 200 : 422, result);
    return true;
  }

  if (pathname === '/api/figma/sync' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
    if (body.cookies || body.token || body.profileDir) {
      send(400, {
        error: 'لا يُسمح بتمرير رموز جلسة أو مسارات ملفات تعريف من الواجهة.',
        reason: 'forbidden_parameter',
      });
      return true;
    }
    try {
      const synced = await orchestrator.sync({
        url: body.url || null,
        localFigPath: body.localFigPath || null,
        refresh: Boolean(body.refresh),
        nodeId: body.nodeId || null,
        captureImage: Boolean(body.captureImage),
        openBrowserOnAuthRequired: Boolean(body.openBrowserOnAuthRequired),
        allowDevFallback: Boolean(body.allowDevFallback),
      });
      send(200, {
        ok: true,
        adapter: synced.adapter,
        source: synced.source,
        usedDevFallback: Boolean(synced.usedDevFallback),
        fileKey: synced.fileKey,
        fileName: synced.fileName,
        selectedNodeId: synced.selectedNodeId,
        exportedAt: synced.exportedAt,
        fileModifiedAt: synced.fileModifiedAt,
        ref: synced.ref,
        index: synced.index,
        hierarchy: synced.hierarchy,
        change: synced.change,
        snapshot: synced.snapshot,
        job: synced.job,
        syncedAt: synced.syncedAt,
      });
    } catch (err) {
      send(err.status || 422, {
        ok: false,
        blocked: Boolean(err.blocked),
        reason: err.reason || 'sync_failed',
        error: err.message,
        recovery: err.recovery || '',
        authStatus: err.authStatus || null,
      });
    }
    return true;
  }

  if (pathname === '/api/figma/pages' && req.method === 'GET') {
    allow('dashboard', 'local');
    const pages = await orchestrator.getPages();
    send(200, pages);
    return true;
  }

  const nodeMatch = pathname.match(/^\/api\/figma\/nodes\/([^/]+)$/);
  if (nodeMatch && req.method === 'GET') {
    allow('dashboard', 'local');
    const nodeId = decodeURIComponent(nodeMatch[1]);
    try {
      const nodeResult = await orchestrator.getNode(nodeId);
      send(200, nodeResult);
    } catch (err) {
      send(err.status || 422, {
        ok: false,
        reason: err.reason || 'node_fetch_failed',
        error: err.message,
        recovery: err.recovery || '',
      });
    }
    return true;
  }

  if (pathname === '/api/figma/refresh' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
    try {
      const refreshed = await orchestrator.refresh({
        url: body.url || null,
        nodeId: body.nodeId || null,
        allowDevFallback: Boolean(body.allowDevFallback),
      });
      send(200, {
        ok: true,
        refreshed: true,
        adapter: refreshed.adapter,
        source: refreshed.source,
        fileKey: refreshed.fileKey,
        fileName: refreshed.fileName,
        selectedNodeId: refreshed.selectedNodeId,
        ref: refreshed.ref,
        index: refreshed.index,
        hierarchy: refreshed.hierarchy,
        change: refreshed.change,
        snapshot: refreshed.snapshot,
        syncedAt: refreshed.syncedAt,
      });
    } catch (err) {
      send(err.status || 422, {
        ok: false,
        blocked: Boolean(err.blocked),
        reason: err.reason || 'refresh_failed',
        error: err.message,
        recovery: err.recovery || '',
      });
    }
    return true;
  }

  if (pathname === '/api/figma/inspect' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 64_000)).toString('utf8') || '{}');
    try {
      const inspection = await inspectReactComponent({
        url: 'http://127.0.0.1:5173',
        selector: body.selector || '[data-testid="react-item"]',
        alsoInspectMobile: body.alsoInspectMobile !== false,
        captureScreenshots: body.captureScreenshots !== false,
        outDir: path.join(cwd, 'out'),
      });
      send(200, inspection);
    } catch (err) {
      send(500, {
        ok: false,
        error: `تعذر فحص مكوّن React عبر Playwright: ${err.message}`,
      });
    }
    return true;
  }

  if (pathname === '/api/figma/compare-parsers' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 64_000)).toString('utf8') || '{}');
    try {
      const comparison = await orchestrator.openFigAdapter.compareWithFigmaReader(
        orchestrator.readerAdapter,
        {
          figPath: body.figPath || 'fixtures/sample-design.fig',
          nodeId: body.nodeId || '942:2734',
        }
      );
      send(200, { ok: true, ...comparison });
    } catch (err) {
      send(422, { ok: false, error: err.message });
    }
    return true;
  }

  if ((pathname === '/api/compare' || pathname === '/api/compare/properties') && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 500_000)).toString('utf8') || '{}');
    const result = orchestrator.compare({
      reference: body.reference,
      actual: body.actual,
      visual: body.visual || null,
      options: body.options || {},
    });
    send(200, result);
    return true;
  }

  if (pathname === '/api/compare/ai' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 500_000)).toString('utf8') || '{}');
    const aiResult = await orchestrator.compareWithAi({
      reference: body.reference,
      actual: body.actual,
      visual: body.visual || null,
      preferredModel: body.preferredModel || body.model || 'gemini-flash-latest',
      apiKey: body.apiKey || null,
    });
    send(200, aiResult);
    return true;
  }

  if (pathname === '/api/compare/visual' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 5_000_000)).toString('utf8') || '{}');

    // If caller passes base64 PNG buffers directly, run Pixelmatch + optional reg-cli
    if (body.expectedPngBase64 && body.actualPngBase64) {
      const expectedBytes = Buffer.from(body.expectedPngBase64, 'base64');
      const actualBytes = Buffer.from(body.actualPngBase64, 'base64');
      const source = body.source || 'genuine-figma-image-user-supplied';
      const pm = runPixelmatchComparison(expectedBytes, actualBytes, {
        threshold: typeof body.threshold === 'number' ? body.threshold : 0.1,
        includeAA: Boolean(body.includeAA),
        source,
      });

      if (pm.ok && body.runRegCli !== false) {
        const outVisual = path.join(cwd, 'out', 'visual');
        const expDir = path.join(outVisual, 'expected');
        const actDir = path.join(outVisual, 'actual');
        const diffDir = path.join(outVisual, 'diff');
        for (const d of [expDir, actDir, diffDir]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(expDir, 'item.png'), expectedBytes);
        fs.writeFileSync(path.join(actDir, 'item.png'), actualBytes);
        fs.writeFileSync(path.join(diffDir, 'item.png'), pm.diffBuffer);
        const reg = runRegCliReport({
          cwd,
          actualDir: actDir,
          expectedDir: expDir,
          diffDir,
        });
        pm.regCli = reg.ok;
        pm.regReportUrl = reg.ok ? '/api/reports/visual/reg-cli-report.html' : null;
      }
      const { diffBuffer, ...serializable } = pm;
      send(pm.ok ? 200 : 422, serializable);
      return true;
    }

    // Otherwise run visual-audit.mjs pipeline
    const args = [path.join(cwd, 'scripts', 'visual-audit.mjs')];
    if (body.demo) args.push('--demo');
    await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        args,
        { cwd, timeout: 120_000, windowsHide: true },
        (error, stdout, stderr) => (error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr }))
      );
    }).catch(err => {
      send(500, { ok: false, error: 'تعذر تشغيل المقارنة البصرية.', details: err.message });
      return null;
    });
    if (res.writableEnded) return true;

    const manifestPath = path.join(cwd, 'out', 'visual', 'manifest.json');
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : { source: 'missing', pixelSimilarity: null, notes: [] };
    send(200, {
      ok: true,
      ...manifest,
      visualReportUrl: '/api/reports/visual/visual-report.html',
      regCliReportUrl: manifest.regCli ? '/api/reports/visual/reg-cli-report.html' : null,
      regJsonUrl: manifest.regCli ? '/api/reports/visual/reg.json' : null,
    });
    return true;
  }

  if (pathname === '/api/reports' && req.method === 'POST') {
    allow('dashboard', 'local');
    const body = JSON.parse((await readBody(req, 2_000_000)).toString('utf8') || '{}');
    const saved = orchestrator.saveReport(body);
    send(200, { ok: true, ...saved });
    return true;
  }

  const reportMatch = pathname.match(/^\/api\/reports\/([a-zA-Z0-9_-]+)$/);
  if (reportMatch && req.method === 'GET') {
    allow('dashboard', 'local');
    const reportId = reportMatch[1];
    const format = url.searchParams.get('format') || 'html';
    const report = orchestrator.getReport(reportId, format);
    if (!report) {
      send(404, { error: 'التقرير المطلوب غير موجود.' });
      return true;
    }
    res.statusCode = 200;
    res.setHeader('content-type', report.contentType);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(report.content);
    return true;
  }

  return false;
}

