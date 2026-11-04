import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { importFigmaExportZip } from '../../lib/import-design.mjs';
import { createBridge, newPairingSecret, safeTokenEqual } from './figma-plugin-bridge.mjs';
import { acceptPluginPayload, assertFileKey, assertNodeId, importFigDocument } from './figma-sync-service.mjs';
import { createDownloadJobs } from './figma-download-service.mjs';
import { ensurePluginPackage } from './plugin-package.mjs';
import { readBaseline, readPrivatePng, savePrivatePng, writeBaseline } from './figma-asset-manager.mjs';
import { FigmaBrowserDownloader } from './figma-browser-downloader.mjs';
import { diffRevisions, fingerprintReference } from './figma-version-tracker.mjs';
import { FigmaSyncOrchestrator } from '../../../server/services/figma-sync-service.mjs';
import { handleFigmaV2Routes } from '../../../server/routes/figma-routes.mjs';

const MAX_JSON = 8_000_000;
const MAX_FILE = 50_000_000;

function contained(root, target) {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function roleOf(headers) {
  const origin = headers.origin ?? '';
  const site = headers['sec-fetch-site'] || '';
  if (origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173' || site === 'same-origin') return 'dashboard';
  if (origin === 'null' || origin === 'https://www.figma.com' || origin === 'https://figma.com') return 'plugin';
  if (!origin && site !== 'cross-site') return 'local';
  return 'forbidden';
}

function hostOk(headers) {
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(headers.host || '');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('حجم الطلب أكبر من الحد المسموح.');
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function loadSecret(dataDir) {
  const file = path.join(dataDir, 'secret');
  if (fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (value.length >= 16) return value;
  }
  const value = newPairingSecret();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, value);
  return value;
}

export function createLocalApi({ dataDir, cwd = process.cwd(), now = () => Date.now(), downloadDesign, readerAdapter = null } = {}) {
  const secret = loadSecret(dataDir);
  const bridge = createBridge({ secret, now });
  const downloads = createDownloadJobs({ dataDir, cwd, now, downloadDesign });
  const browserDownloader = new FigmaBrowserDownloader({
    cwd,
    userDataDir: path.join(cwd, '.browser-profile'),
    downloadsDir: path.join(cwd, 'input', 'downloads'),
  });
  const orchestrator = new FigmaSyncOrchestrator({
    cwd,
    dataDir,
    readerAdapter,
  });
  const revisionPath = path.join(dataDir, 'revision.json');
  const lastPath = path.join(dataDir, 'last-sync.json');
  let visualRun = null;
  if (fs.existsSync(revisionPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(revisionPath, 'utf8'));
      bridge.rememberSync({ at: Date.parse(saved.at) || 0, fileKey: saved.fileKey, nodeId: saved.nodeId, pluginRevision: saved.pluginRevision, previewId: saved.previewId || null });
    } catch { /* a damaged local revision file must not block the server */ }
  }

  function persist(accepted, pluginRevision, previewId) {
    const record = { ...accepted.current, fileKey: accepted.ref.fileKey, nodeId: accepted.ref.nodeId, pluginRevision, previewId, at: new Date().toISOString() };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(revisionPath, JSON.stringify(record));
    fs.writeFileSync(lastPath, JSON.stringify({ ref: accepted.ref, index: accepted.index, change: accepted.change, previewId, previewNote: accepted.previewNote, savedAt: record.at, sourceType: 'figma-plugin-connector' }));
    bridge.rememberSync({ at: Date.now(), fileKey: accepted.ref.fileKey, nodeId: accepted.ref.nodeId, pluginRevision, previewId });
    return record;
  }

  async function handle(req, res) {
    const headers = req.headers || {};
    const role = roleOf(headers);
    if (role === 'plugin') {
      res.setHeader('access-control-allow-origin', headers.origin);
      res.setHeader('access-control-allow-headers', 'content-type, x-fidelity-token, x-node-id, x-file-key, x-node-name');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('vary', 'Origin');
    }
    const send = (code, body) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      res.end(JSON.stringify(body));
    };
    const fail = error => send(error.status || 400, { error: error.message, recovery: error.recovery || '', reason: error.reason || error.code || '' });
    try {
      if (!hostOk(headers)) return send(403, { error: 'الجسر يستمع للطلبات المحلية فقط.', recovery: 'افتح http://127.0.0.1:5173 على هذا الجهاز.' });
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      const url = new URL(req.url, 'http://127.0.0.1');
      const allow = (...roles) => {
        if (!roles.includes(role)) throw Object.assign(new Error('اتصال مرفوض. الجسر يقبل لوحة التحكم المحلية أو إضافة Figma المقترنة فقط.'), { status: 403 });
      };
      const token = headers['x-fidelity-token'] || '';

      if (url.pathname === '/api/figma-download' && req.method === 'POST') {
        allow('dashboard', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        return send(202, downloads.start(body));
      }
      if (url.pathname === '/api/figma-download/status' && req.method === 'GET') {
        allow('dashboard', 'local');
        return send(200, downloads.status());
      }
      if (url.pathname === '/api/figma-download/select' && req.method === 'POST') {
        allow('dashboard', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        return send(200, await downloads.select(body.nodeId));
      }
      if (url.pathname === '/api/local-figma-export' && req.method === 'GET') {
        allow('dashboard', 'local');
        return await legacyZipLookup(url, cwd, send);
      }
      if (url.pathname === '/api/figma-browser/status' && req.method === 'GET') {
        allow('dashboard', 'local');
        return send(200, browserDownloader.getStatus());
      }
      if (url.pathname === '/api/figma-browser/download' && req.method === 'POST') {
        allow('dashboard', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        if (!body.url) throw Object.assign(new Error('يرجى توفير رابط تصميم Figma.'), { status: 400 });
        if (body.cookies || body.profileDir || body.token) throw Object.assign(new Error('الطلب يقبل رابط التصميم فقط.'), { status: 400, recovery: 'لا تُرسل ملفات تعريف أو رموز جلسة.' });
        const result = await browserDownloader.download(body.url);
        if (!result?.ok || !result.ref || !result.figPath) throw Object.assign(new Error('التنزيل لم ينتج ملفًا مقروءًا.'), { status: 422, reason: 'download_failed' });
        const current = fingerprintReference(result.ref);
        const previousRevision = readRevision(revisionPath);
        const change = diffRevisions(previousRevision, current);
        const record = { ...current, fileKey: result.fileKey, nodeId: result.nodeId, at: new Date().toISOString() };
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(revisionPath, JSON.stringify(record));
        fs.writeFileSync(lastPath, JSON.stringify({
          ref: result.ref, index: result.index, change, savedAt: record.at,
          sourceType: 'openfig-native-file', figPath: result.figPath,
        }));
        return send(200, {
          ok: true, ref: result.ref, index: result.index, change, previewUrl: null,
          previewNote: 'ملف .fig لا يحتوي لقطة عقدة بأبعاد مطابقة، لذلك التشابه البصري الأصيل غير متاح.',
          figPath: result.figPath, sourceType: 'openfig-native-file', parsedCount: result.parsedCount,
          byteLength: result.byteLength, message: `حُفظ ${result.figPath} وقُرئ بـ OpenFig.`,
        });
      }
      if (url.pathname === '/api/figma-browser/select' && req.method === 'POST') {
        allow('dashboard', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        return send(200, await browserDownloader.selectNode(body.nodeId));
      }
      const browserPreviewMatch = url.pathname.match(/^\/api\/figma-browser\/preview\/([a-zA-Z0-9_-]+)$/);
      if (browserPreviewMatch && req.method === 'GET') {
        allow('dashboard', 'local');
        const fileKey = browserPreviewMatch[1];
        const previewFile = path.join(cwd, 'input', 'downloads', `${fileKey}-ref.png`);
        if (!fs.existsSync(previewFile)) return send(404, { error: 'صورة المعاينة غير موجودة.' });
        res.statusCode = 200;
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('x-content-type-options', 'nosniff');
        res.end(fs.readFileSync(previewFile));
        return;
      }
      if (url.pathname === '/api/figma-connector/status' && req.method === 'GET') {
        allow('dashboard', 'local', 'plugin');
        bridge.expireStale();
        return send(200, bridge.status());
      }
      if (url.pathname === '/api/figma-connector/pairing' && req.method === 'GET') {
        allow('dashboard', 'local');
        return send(200, { token: secret, hint: 'الصق هذا الرمز داخل إضافة Figma على هذا الجهاز فقط. لا ترسله إلى موقع آخر.' });
      }
      if (url.pathname === '/api/figma-connector/hello' && req.method === 'POST') {
        allow('plugin', 'local');
        const body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}');
        return send(200, bridge.hello({ token, ...body }));
      }
      if (url.pathname === '/api/figma-connector/poll' && req.method === 'GET') {
        allow('plugin', 'local');
        return send(200, bridge.poll({
          token, sessionId: url.searchParams.get('session') || '', revision: url.searchParams.get('revision') || '',
          fileKey: url.searchParams.get('fileKey') || '', fileName: url.searchParams.get('fileName') || '', editorType: url.searchParams.get('editorType') || '',
        }));
      }
      if (url.pathname === '/api/figma-connector/sync' && req.method === 'POST') {
        allow('dashboard', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        if (body.url || body.href) throw Object.assign(new Error('الخادم لا يجلب روابط. الصق الرابط في اللوحة فقط ليُحلَّل محليًا.'), { status: 400 });
        const fileKey = assertFileKey(body.fileKey);
        const nodeId = assertNodeId(body.nodeId);
        const job = bridge.createJob({ fileKey, nodeId, fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : '', mode: body.mode });
        return send(job.state === 'failed' ? 409 : 202, jobResponse(job));
      }
      const jobMatch = url.pathname.match(/^\/api\/figma-connector\/jobs\/([a-zA-Z0-9-]+)$/);
      if (jobMatch && req.method === 'GET') {
        allow('dashboard', 'local');
        bridge.expireStale();
        const job = bridge.getJob(jobMatch[1]);
        if (!job) return send(404, { error: 'طلب المزامنة غير موجود.', recovery: 'ابدأ مزامنة جديدة من اللوحة.' });
        return send(200, jobResponse(job));
      }
      if (url.pathname === '/api/figma-connector/result' && req.method === 'POST') {
        allow('plugin', 'local');
        const body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}');
        const job = bridge.completeJob({ token, sessionId: body.sessionId, jobId: body.jobId, payload: body });
        let accepted;
        try { accepted = acceptPluginPayload(body, readRevision(revisionPath)); }
        catch (error) {
          job.state = 'failed';
          job.reason = 'sync_failed';
          job.message = error.message;
          return send(400, { error: error.message, recovery: 'قلّل نطاق التحديد في Figma ثم أعد المزامنة.' });
        }
        let previewId = null;
        if (accepted.png) {
          previewId = job.id;
          savePrivatePng(dataDir, previewId, accepted.png);
        }
        const pluginRevision = typeof body.revision === 'string' ? body.revision.slice(0, 64) : null;
        persist(accepted, pluginRevision, previewId);
        job.publicResult = publicSync(accepted, previewId);
        return send(200, { ok: true, change: accepted.change });
      }
      if (url.pathname === '/api/figma-connector/fail' && req.method === 'POST') {
        allow('plugin', 'local');
        const body = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
        bridge.failJob({ token, sessionId: body.sessionId, jobId: body.jobId, reason: body.reason, message: body.message });
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/figma-connector/last' && req.method === 'GET') {
        allow('dashboard', 'local');
        if (fs.existsSync(lastPath)) {
          const saved = JSON.parse(fs.readFileSync(lastPath, 'utf8'));
          if (saved.previewId && !saved.previewUrl) saved.previewUrl = `/api/figma-connector/assets/${saved.previewId}`;
          saved.fromCache = true;
          return send(200, saved);
        }
        return send(200, {
          ok: true,
          hasLastSync: false,
          ref: null,
          message: 'لا توجد مزامنة سابقة محفوظة بعد؛ يتم استخدام المرجع الافتراضي.',
        });
      }
      if (url.pathname === '/api/plugin/info' && req.method === 'GET') {
        allow('dashboard', 'local');
        const info = ensurePluginPackage(cwd, dataDir);
        return send(200, { href: info.href, bytes: info.bytes, builtAt: info.builtAt, cached: info.cached, name: info.name });
      }
      if (url.pathname === '/api/plugin/download' && req.method === 'GET') {
        allow('dashboard', 'local');
        const info = ensurePluginPackage(cwd, dataDir);
        const zip = fs.readFileSync(info.zipPath);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/zip');
        res.setHeader('content-disposition', 'attachment; filename="figma-fidelity-connector.zip"');
        res.setHeader('cache-control', 'private, max-age=3600');
        res.setHeader('x-content-type-options', 'nosniff');
        res.end(zip);
        return;
      }
      const assetMatch = url.pathname.match(/^\/api\/figma-connector\/assets\/([a-zA-Z0-9-]+)$/);
      if (assetMatch && req.method === 'GET') {
        allow('dashboard', 'local');
        const png = readPrivatePng(dataDir, assetMatch[1]);
        if (!png) return send(404, { error: 'صورة المزامنة غير موجودة.', recovery: 'أعد المزامنة لعقدة تدعم تصدير PNG.' });
        res.statusCode = 200;
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('x-content-type-options', 'nosniff');
        res.end(png);
        return;
      }
      if (url.pathname === '/api/import-zip' && req.method === 'POST') {
        allow('dashboard', 'local');
        const bytes = await readBody(req, MAX_FILE);
        const fileKey = headers['x-file-key'] || null;
        const nodeId = headers['x-node-id'] || null;
        if (fileKey) assertFileKey(fileKey);
        if (nodeId) assertNodeId(nodeId);
        const baseline = fileKey ? readBaseline(dataDir, fileKey) : null;
        const result = importFigmaExportZip(bytes, { fileKey, nodeId, baseline });
        if (result.bundleBaseline) writeBaseline(dataDir, result.bundleBaseline);
        let previewUrl = null;
        if (result.previewPng) {
          const id = `zip${Date.now().toString(16)}`.padEnd(16, '0').slice(0, 32);
          savePrivatePng(dataDir, id, Buffer.from(result.previewPng));
          previewUrl = `/api/figma-connector/assets/${id}`;
        }
        return send(200, { ref: result.ref, selectedId: result.selectedId, sourceType: result.sourceType, fileKey: result.fileKey, viewName: result.viewName, exportedAt: result.exportedAt, deltaApplied: result.deltaApplied, sideFiles: presence(result.sideFiles), previewUrl, previewKind: result.previewKind, index: result.index });
      }
      if (url.pathname === '/api/import-fig' && req.method === 'POST') {
        allow('dashboard', 'local');
        const bytes = await readBody(req, MAX_FILE);
        const nodeId = headers['x-node-id'] || null;
        const nodeName = headers['x-node-name'] ? decodeURIComponent(headers['x-node-name']) : null;
        if (nodeId) assertNodeId(nodeId);
        const imported = await importFigDocument(bytes, { nodeId, nodeName, fileName: 'local.fig' });
        return send(200, imported);
      }
      if (url.pathname === '/api/run-visual' && req.method === 'POST') {
        allow('dashboard', 'local');
        if (visualRun) return send(409, { error: 'مقارنة بصرية قيد التشغيل.', recovery: 'انتظر انتهاء التشغيل الحالي.' });
        const expected = chooseExpected(dataDir, cwd);
        if (!expected) return send(422, { error: 'لا توجد صورة مرجعية أصيلة. التشابه البصري غير متاح.', recovery: 'زامن عقدة من الإضافة لتصدير PNG، أو ضع صورة بنفس النطاق في input/figma-expected.png ثم أعد المحاولة.' });
        visualRun = runVisual(cwd, expected).finally(() => { visualRun = null; });
        try { await visualRun; }
        catch (error) { return send(500, { error: 'تعذر تشغيل المقارنة البصرية.', recovery: String(error.stderr || error.message || '').slice(0, 400) }); }
        return send(200, readManifest(cwd));
      }
      if (url.pathname === '/api/visual-status' && req.method === 'GET') {
        allow('dashboard', 'local');
        return send(200, readManifest(cwd));
      }
      if (url.pathname.startsWith('/api/reports/visual/') && req.method === 'GET') {
        allow('dashboard', 'local');
        return serveUnder(path.join(cwd, 'out', 'visual'), decodeURIComponent(url.pathname.slice('/api/reports/visual/'.length)), res, send);
      }
      if (url.pathname === '/api/reports/client' && req.method === 'POST') {
        allow('dashboard', 'local');
        const html = (await readBody(req, 1_500_000)).toString('utf8');
        if (!html.startsWith('<!doctype html>')) throw Object.assign(new Error('التقرير المرسل ليس HTML صادرًا من اللوحة.'), { status: 400 });
        const dir = path.join(cwd, 'out', 'reports');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'client-report.html'), html);
        return send(200, { ok: true, path: 'out/reports/client-report.html', href: '/api/reports/saved/client-report.html' });
      }
      if (url.pathname.startsWith('/api/reports/saved/') && req.method === 'GET') {
        allow('dashboard', 'local');
        return serveUnder(path.join(cwd, 'out', 'reports'), decodeURIComponent(url.pathname.slice('/api/reports/saved/'.length)), res, send);
      }
      const handledV2 = await handleFigmaV2Routes({
        req,
        res,
        url,
        orchestrator,
        cwd,
        readBody,
        send,
        allow,
      });
      if (handledV2) return;
      send(404, { error: 'مسار محلي غير موجود.' });
    } catch (error) {
      if (!res.headersSent && !res.writableEnded) fail(error);
    }
  }

  async function legacyZipLookup(url, root, send) {
    const fileKey = url.searchParams.get('fileKey');
    const nodeId = url.searchParams.get('nodeId') || null;
    if (!/^[a-zA-Z0-9]{8,}$/.test(fileKey || '')) return send(400, { error: 'Invalid Figma file key' });
    if (nodeId && !/^\d+:\d+$/.test(nodeId)) return send(400, { error: 'Invalid node ID' });
    const dir = path.join(root, 'input', 'figma-exports');
    let files = [];
    try { files = (await fs.promises.readdir(dir)).filter(name => name.toLowerCase().endsWith('.zip')); }
    catch (error) { if (error.code !== 'ENOENT') return send(500, { error: error.message }); }
    const ranked = await Promise.all(files.slice(0, 100).map(async name => {
      const full = path.join(dir, name);
      const stat = await fs.promises.stat(full);
      return { full, time: stat.mtimeMs, size: stat.size, name };
    }));
    ranked.sort((a, b) => b.time - a.time);
    for (const file of ranked) {
      if (file.size > 50_000_000) continue;
      try {
        const bytes = await fs.promises.readFile(file.full);
        const result = importFigmaExportZip(bytes, { fileKey, nodeId });
        if (result.bundleBaseline) writeBaseline(dataDir, result.bundleBaseline);
        return send(200, { ref: result.ref, selectedId: result.selectedId, sourceType: result.sourceType, fileKey: result.fileKey, viewName: result.viewName, exportedAt: result.exportedAt, localFile: file.name, index: result.index });
      } catch (error) {
        if (String(error.message).includes('العنصر') && String(error.message).includes('غير موجود')) return send(422, { error: error.message, localFile: file.name });
      }
    }
    return send(404, { error: 'لا يوجد تصدير ZIP مطابق في input/figma-exports. هذا مسار احتياطي وليس تنزيلًا من المتصفح.', recovery: 'استخدم تنزيل التصميم، أو ضع ملف ZIP هنا إن كان لديك تصدير سابق.' });
  }

  return { handle, bridge, secret, orchestrator, tokenOk: given => safeTokenEqual(given, secret) };
}

function readRevision(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function jobResponse(job) {
  return {
    id: job.id, state: job.state, reason: job.reason, message: job.message, recovery: job.recovery || '',
    error: job.state === 'failed' ? job.message : undefined,
    result: job.publicResult || null,
  };
}

function publicSync(accepted, previewId) {
  return { ref: accepted.ref, index: accepted.index, change: accepted.change, previewUrl: previewId ? `/api/figma-connector/assets/${previewId}` : null, previewNote: accepted.previewNote, sourceType: 'figma-plugin-connector' };
}

function presence(sideFiles) {
  return Object.fromEntries(Object.entries(sideFiles || {}).map(([key, value]) => [key, { present: Boolean(value?.present), omitted: value?.omitted || null }]));
}

function chooseExpected(dataDir, cwd) {
  const revision = readRevision(path.join(dataDir, 'revision.json'));
  if (revision?.previewId) {
    const pluginPng = path.join(dataDir, 'assets', `${revision.previewId}.png`);
    if (fs.existsSync(pluginPng)) return { file: pluginPng, source: 'figma-plugin-export' };
  }
  const userPng = path.join(cwd, 'input', 'figma-expected.png');
  if (fs.existsSync(userPng)) return { file: userPng, source: 'genuine-figma-image-user-supplied' };
  return null;
}

function runVisual(cwd, expected) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(cwd, 'scripts', 'visual-audit.mjs')], {
      cwd,
      timeout: 120000,
      env: { ...process.env, FIGMA_EXPECTED: expected.file, FIGMA_SOURCE: expected.source },
    }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr }));
  });
}

function readManifest(cwd) {
  const file = path.join(cwd, 'out', 'visual', 'manifest.json');
  if (!fs.existsSync(file)) return { source: 'missing', pixelSimilarity: null, notes: ['لم تُشغَّل مقارنة بصرية بعد.'] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function serveUnder(root, rel, res, send) {
  if (!rel || rel.includes('\0')) return send(400, { error: 'مسار التقرير غير صالح.' });
  const target = path.resolve(root, rel);
  const ext = path.extname(target).toLowerCase();
  if (!contained(path.resolve(root), target) || !fs.existsSync(target) || !['.html', '.png', '.json', '.css', '.js'].includes(ext)) {
    return send(404, { error: 'التقرير غير موجود بعد.', recovery: 'شغّل المقارنة البصرية أو ولّد تقرير العميل أولًا.' });
  }
  const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  res.statusCode = 200;
  res.setHeader('content-type', types[ext]);
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(fs.readFileSync(target));
}

export function attachLocalApi(middlewares, options = {}) {
  const root = options.cwd || process.cwd();
  const api = createLocalApi({ dataDir: options.dataDir || path.join(root, 'input', '.connector'), cwd: root });
  middlewares.use((req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return next();
    api.handle(req, res).catch(error => {
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  });
  return api;
}

export async function invokeLocalApi(api, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  const stream = Readable.from(body == null ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(body)]);
  stream.method = method;
  stream.url = url;
  stream.headers = Object.fromEntries(Object.entries({ host: '127.0.0.1:5173', ...headers }).map(([key, value]) => [key.toLowerCase(), value]));
  let finished;
  const done = new Promise(resolve => { finished = resolve; });
  const res = {
    statusCode: 200, headers: {}, writableEnded: false, headersSent: false,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value) { this.writableEnded = true; this.body = value; finished(); },
  };
  await api.handle(stream, res);
  await done;
  const raw = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body || '');
  let parsed = raw;
  const type = String(res.headers['content-type'] || '');
  if (type.includes('json')) parsed = JSON.parse(raw.toString('utf8') || 'null');
  return { status: res.statusCode, headers: res.headers, body: parsed, raw };
}
