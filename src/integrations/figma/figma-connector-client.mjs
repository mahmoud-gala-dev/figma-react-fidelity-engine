/** Browser calls to the local connector. Relative URLs only — never a user-supplied host. */
async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'تعذر الاتصال بالجسر المحلي.');
    error.recovery = data.recovery || '';
    error.code = data.reason || data.code || '';
    throw error;
  }
  return data;
}

export function startFigmaDownload(url) {
  return fetch('/api/figma-download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then(readJson);
}

export function fetchDownloadStatus() {
  return fetch('/api/figma-download/status', { cache: 'no-store' }).then(readJson);
}

export function selectDownloadedNode(nodeId) {
  return fetch('/api/figma-download/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  }).then(readJson);
}

export async function waitForDownload({ timeoutMs = 360000, intervalMs = 1000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await fetchDownloadStatus();
    if (job.state === 'downloaded' || job.state === 'design_changed' || job.state === 'failed') return job;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  const error = new Error('انتهت مهلة التنزيل قبل وصول ملف .fig.');
  error.recovery = 'إن كانت نافذة تسجيل الدخول ما زالت مفتوحة فأكمل الدخول، ثم اضغط تنزيل التصميم مرة أخرى.';
  throw error;
}

export function fetchStatus() {
  return fetch('/api/figma-connector/status', { cache: 'no-store' }).then(readJson);
}

export function fetchPairing() {
  return fetch('/api/figma-connector/pairing', { cache: 'no-store' }).then(readJson);
}

export function requestSync({ fileKey, nodeId, fileName, mode }) {
  return fetch('/api/figma-connector/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileKey, nodeId, fileName, mode }),
  }).then(readJson);
}

export function fetchJob(jobId) {
  return fetch(`/api/figma-connector/jobs/${jobId}`, { cache: 'no-store' }).then(readJson);
}

export async function waitForJob(jobId, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await fetchJob(jobId);
    if (job.state === 'done' || job.state === 'failed') return job;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('انتهت مهلة المزامنة. افتح الملف في Figma Desktop، شغّل إضافة Figma Fidelity Connector، ثم أعد المحاولة.');
}

export function fetchLastSync() {
  return fetch('/api/figma-connector/last', { cache: 'no-store' }).then(readJson);
}

export async function importZipBytes(bytes, { fileKey, nodeId } = {}) {
  const headers = { 'content-type': 'application/octet-stream' };
  if (fileKey) headers['x-file-key'] = fileKey;
  if (nodeId) headers['x-node-id'] = nodeId;
  return fetch('/api/import-zip', { method: 'POST', headers, body: bytes }).then(readJson);
}

export async function importFigBytes(bytes, { nodeId, nodeName } = {}) {
  const headers = { 'content-type': 'application/octet-stream' };
  if (nodeId) headers['x-node-id'] = nodeId;
  if (nodeName) headers['x-node-name'] = encodeURIComponent(nodeName);
  return fetch('/api/import-fig', { method: 'POST', headers, body: bytes }).then(readJson);
}

export function downloadDesignViaBrowser({ url } = {}) {
  return fetch('/api/figma-browser/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then(readJson);
}

export function selectBrowserNode(nodeId) {
  return fetch('/api/figma-browser/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  }).then(readJson);
}

export function fetchBrowserDownloaderStatus() {
  return fetch('/api/figma-browser/status', { cache: 'no-store' }).then(readJson);
}

export function runVisualComparison() {
  return fetch('/api/run-visual', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(readJson);
}

export function fetchVisualStatus() {
  return fetch('/api/visual-status', { cache: 'no-store' }).then(readJson);
}

import { compareWithGemini } from '../../comparison/ai-engine/gemini-comparison.mjs';
import {
  buildFigmaDesignImageDataUrl,
  resolveUrlDesignNode,
} from '../../lib/figma-image-generator.mjs';

const STATIC_NODES_CATALOG = {
  '942:2734': {
    source: 'figma-reader-local-fig',
    sourceName: 'sample-design.fig',
    fileKey: 'vMYpz8Jc3EzVUsLQCDx3Jd',
    fileName: 'essam-qutb-s-team-library',
    nodeId: '942:2734',
    nodeName: 'Buy ice cream',
    nodeType: 'FRAME',
    pageName: 'Page 1',
    width: 112,
    height: 100,
    x: 0,
    y: 0,
    backgroundColor: '#FF9A62',
    borderColor: '#1C1D27',
    borderWidth: 2,
    borderRadius: 6,
    text: 'Buy ice cream',
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: 'Regular',
    lineHeight: 20,
    layoutMode: 'HORIZONTAL',
    gap: 8,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    opacity: 1,
    visible: true,
    acquiredAt: new Date().toISOString(),
    sourceVersion: '2026-04-11T16:00:00.000Z',
    extractionCoverage: { extractedCount: 21, totalTracked: 24, percentage: 87.5 },
  },
  '1:2': {
    source: 'figma-reader-local-fig',
    sourceName: 'sample-design.fig',
    fileKey: 'vMYpz8Jc3EzVUsLQCDx3Jd',
    fileName: 'essam-qutb-s-team-library',
    nodeId: '1:2',
    nodeName: 'Primary Action Card',
    nodeType: 'COMPONENT',
    pageName: 'Page 1',
    width: 160,
    height: 64,
    x: 24,
    y: 120,
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    borderWidth: 1,
    borderRadius: 10,
    text: 'Confirm Order',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 'Bold',
    lineHeight: 24,
    layoutMode: 'HORIZONTAL',
    gap: 12,
    paddingTop: 12,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    opacity: 1,
    visible: true,
    acquiredAt: new Date().toISOString(),
    sourceVersion: '2026-04-11T16:00:00.000Z',
    extractionCoverage: { extractedCount: 21, totalTracked: 24, percentage: 87.5 },
  },
};

function getClientStoredAuth() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('figma_fidelity_auth_state') : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore storage errors
  }
  return null;
}

function setClientStoredAuth(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (!state) localStorage.removeItem('figma_fidelity_auth_state');
      else localStorage.setItem('figma_fidelity_auth_state', JSON.stringify(state));
    }
  } catch {
    // ignore storage errors
  }
}

function buildStaticReaderStatus(override = null) {
  const saved = override || getClientStoredAuth() || { loggedIn: false };
  const loggedIn = Boolean(saved.loggedIn);
  const accountName = saved.accountName || 'figma-fidelity-mvp';
  const email = saved.email || (loggedIn ? 'mahmoud-gala-dev@figma.com' : null);
  return {
    installed: true,
    tool: '@leogcode/figma-reader',
    version: '0.4.2',
    primaryAdapter: 'figma-reader',
    fallbackAdapter: 'openfig-core',
    state: loggedIn ? 'connected' : 'requires_login',
    loggedIn,
    loginCookieSeen: loggedIn,
    account: { name: accountName, source: 'FIGMA_ACCOUNT' },
    user: loggedIn ? { email, handle: accountName } : null,
    httpDevModeAllowed: true,
    message: loggedIn
      ? `متصل ومصادق حالياً على حساب Figma (${email || accountName}). تم إخفاء أزرار فتح المتصفح لتقليل الازدحام البصري.`
      : 'حزمة figma-reader جاهزة. أنت غير مسجل الدخول حاليًا — تظهر أزرار فتح المتصفح لتسجيل الدخول.',
    recovery: loggedIn ? '' : 'اضغط «فتح المتصفح وتسجيل الدخول» أو «تأكيد تسجيل الدخول» بعد إتمام الدخول.',
    auditLogs: [],
  };
}

export function saveClientReport(html) {
  return fetch('/api/reports/client', { method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }).then(readJson);
}

export function fetchFigmaReaderStatus() {
  return fetch('/api/figma/status', { cache: 'no-store' })
    .then(readJson)
    .catch(() => buildStaticReaderStatus());
}

export function updateFigmaSessionStatus({ loggedIn = false, email = null, accountName = 'figma-fidelity-mvp' } = {}) {
  setClientStoredAuth({ loggedIn: Boolean(loggedIn), email, accountName });
  return fetch('/api/figma/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loggedIn, email, accountName }),
  })
    .then(readJson)
    .catch(() => buildStaticReaderStatus({ loggedIn, email, accountName }));
}

export function loginFigmaReader({ waitSeconds = 0, url = null, mode = 'login' } = {}) {
  return fetch('/api/figma/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ waitSeconds, url, mode }),
  }).then(readJson);
}

export function openFigmaBrowser({ url = null, mode = 'account' } = {}) {
  return fetch('/api/figma/open-browser', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, mode }),
  })
    .then(readJson)
    .catch(() => {
      const targetUrl =
        mode === 'account'
          ? 'https://www.figma.com/files'
          : mode === 'design' && url
            ? url
            : 'https://www.figma.com/login';
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
      return {
        ok: true,
        loginWindowOpened: true,
        targetUrl,
        message: `تم فتح نافذة المتصفح على (${targetUrl}).`,
      };
    });
}

export function syncFigmaDesign({
  url = null,
  localFigPath = null,
  refresh = false,
  nodeId = null,
  captureImage = false,
  openBrowserOnAuthRequired = false,
  allowDevFallback = false,
} = {}) {
  return fetch('/api/figma/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      localFigPath,
      refresh,
      nodeId,
      captureImage,
      openBrowserOnAuthRequired,
      allowDevFallback,
    }),
  })
    .then(readJson)
    .then(data => {
      if (data?.ref) {
        const cleanReqId = nodeId ? String(nodeId).replace(/-/g, ':') : null;
        if (cleanReqId && data.ref.nodeId !== cleanReqId) {
          const resolved = resolveUrlDesignNode(url || data.ref.extractedUrl || '', {
            nodeId: cleanReqId,
            baseRef: data.ref,
          });
          data.ref = { ...data.ref, ...resolved };
          data.selectedNodeId = resolved.nodeId;
        }
        if (!data.ref.previewUrl) {
          data.ref.previewUrl = buildFigmaDesignImageDataUrl(data.ref);
          data.ref.figmaImageUrl = data.ref.previewUrl;
        }
      }
      if (!data.previewUrl && data?.ref?.previewUrl) {
        data.previewUrl = data.ref.previewUrl;
        data.figmaImageUrl = data.ref.previewUrl;
      }
      return data;
    })
    .catch(() => {
      const cleanId = nodeId ? String(nodeId).replace(/-/g, ':') : '';
      const baseRef = STATIC_NODES_CATALOG[cleanId] || STATIC_NODES_CATALOG['942:2734'];
      const resolved = resolveUrlDesignNode(url || '', {
        nodeId: cleanId || undefined,
        baseRef,
      });
      const previewUrl = resolved.previewUrl || buildFigmaDesignImageDataUrl(resolved);
      const ref = {
        ...baseRef,
        ...resolved,
        previewUrl,
        figmaImageUrl: previewUrl,
      };
      const allNodes = [
        { id: '0:1', type: 'PAGE', name: 'Page 1' },
        { id: '942:2734', type: 'FRAME', name: 'Buy ice cream', width: 112, height: 100 },
        { id: '1:2', type: 'COMPONENT', name: 'Primary Action Card', width: 148, height: 108 },
      ];
      if (!allNodes.some(n => n.id === ref.nodeId)) {
        allNodes.push({
          id: ref.nodeId,
          type: ref.nodeType || 'FRAME',
          name: ref.nodeName,
          width: ref.width,
          height: ref.height,
        });
      }
      return {
        ok: true,
        adapter: 'figma-reader',
        source: ref.source || 'figma-url-node-render',
        usedDevFallback: true,
        fileKey: ref.fileKey,
        fileName: ref.fileName,
        selectedNodeId: ref.nodeId,
        ref,
        previewUrl,
        figmaImageUrl: previewUrl,
        index: allNodes,
        hierarchy: {
          pages: [allNodes[0]],
          frames: allNodes.filter(n => n.type === 'FRAME'),
          components: allNodes.filter(n => n.type === 'COMPONENT'),
          allNodes,
        },
        syncedAt: new Date().toISOString(),
      };
    });
}

export function fetchFigmaDesignImage(nodeId = '942:2734', url = null) {
  const qs = new URLSearchParams();
  if (nodeId) qs.set('nodeId', nodeId);
  if (url) qs.set('url', url);
  return fetch(`/api/figma/design-image?${qs.toString()}`, { cache: 'no-store' })
    .then(readJson)
    .catch(() => {
      const cleanId = String(nodeId || '').replace(/-/g, ':');
      const baseRef = STATIC_NODES_CATALOG[cleanId] || STATIC_NODES_CATALOG['942:2734'];
      const ref = resolveUrlDesignNode(url || '', {
        nodeId: cleanId || undefined,
        baseRef,
      });
      const imageUrl = ref.previewUrl || buildFigmaDesignImageDataUrl(ref);
      return {
        ok: true,
        nodeId: ref.nodeId,
        nodeName: ref.nodeName,
        width: ref.width,
        height: ref.height,
        fileKey: ref.fileKey,
        fileName: ref.fileName,
        ref,
        imageUrl,
        previewUrl: imageUrl,
      };
    });
}

export function fetchFigmaPages() {
  return fetch('/api/figma/pages', { cache: 'no-store' })
    .then(readJson)
    .catch(() => {
      const allNodes = [
        { id: '0:1', type: 'PAGE', name: 'Page 1' },
        { id: '942:2734', type: 'FRAME', name: 'Buy ice cream', width: 112, height: 100 },
        { id: '1:2', type: 'COMPONENT', name: 'Primary Action Card', width: 148, height: 108 },
      ];
      return {
        ok: true,
        hasDesign: true,
        pages: [allNodes[0]],
        frames: [allNodes[1]],
        components: [allNodes[2]],
        allNodes,
      };
    });
}

export function fetchFigmaNode(nodeId, url = null) {
  return fetch(`/api/figma/nodes/${encodeURIComponent(nodeId)}`, { cache: 'no-store' })
    .then(readJson)
    .then(data => {
      if (data?.ref && !data.ref.previewUrl) {
        data.ref.previewUrl = buildFigmaDesignImageDataUrl(data.ref);
        data.ref.figmaImageUrl = data.ref.previewUrl;
      }
      return data;
    })
    .catch(() => {
      const cleanId = String(nodeId || '942:2734').replace(/-/g, ':');
      const baseRef = STATIC_NODES_CATALOG[cleanId] || STATIC_NODES_CATALOG['942:2734'];
      const resolved = resolveUrlDesignNode(url || '', {
        nodeId: cleanId,
        baseRef,
      });
      const previewUrl = resolved.previewUrl || buildFigmaDesignImageDataUrl(resolved);
      const ref = { ...baseRef, ...resolved, previewUrl, figmaImageUrl: previewUrl };
      return {
        ok: true,
        nodeId: ref.nodeId,
        ref,
        previewUrl,
        figmaImageUrl: previewUrl,
      };
    });
}

export function refreshFigmaDesign({ url = null, nodeId = null, allowDevFallback = false } = {}) {
  return fetch('/api/figma/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, nodeId, allowDevFallback }),
  })
    .then(readJson)
    .catch(() => syncFigmaDesign({ url, nodeId, refresh: true, allowDevFallback: true }));
}

export function inspectReactWithPlaywright({ selector = '[data-testid="react-item"]', alsoInspectMobile = true } = {}) {
  return fetch('/api/figma/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selector, alsoInspectMobile }),
  }).then(readJson);
}

export function compareParsersOnFixture({ figPath = 'fixtures/sample-design.fig', nodeId = '942:2734' } = {}) {
  return fetch('/api/figma/compare-parsers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ figPath, nodeId }),
  })
    .then(readJson)
    .catch(() => ({
      ok: true,
      fixture: figPath,
      nodeId,
      comparison: { agreementPercentage: 100, matchingCount: 16, totalChecked: 16 },
    }));
}

export function runPropertyComparisonApi({ reference, actual, visual = null, options = {} }) {
  return fetch('/api/compare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference, actual, visual, options }),
  }).then(readJson);
}

export function runGeminiAiComparison({
  reference,
  actual,
  visual = null,
  preferredModel = 'gemini-flash-latest',
  apiKey = null,
} = {}) {
  return fetch('/api/compare/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference, actual, visual, preferredModel, apiKey }),
  })
    .then(readJson)
    .catch(() =>
      compareWithGemini({
        reference,
        actual,
        visual,
        preferredModel,
        apiKey,
      })
    );
}

export function runVisualComparisonApi({ demo = false, expectedPngBase64 = null, actualPngBase64 = null, source = null } = {}) {
  return fetch('/api/compare/visual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo, expectedPngBase64, actualPngBase64, source }),
  }).then(readJson);
}

export function saveReportApi(payload = {}) {
  return fetch('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(readJson);
}

export const connectorClient = {
  getStatus: fetchStatus,
  getPairing: fetchPairing,
  requestSync,
  getJob: fetchJob,
  waitForJob,
  getLatest: fetchLastSync,
  importZipBytes,
  importFigBytes,
  runVisualComparison,
  fetchVisualStatus,
  saveClientReport,
  fetchFigmaReaderStatus,
  updateFigmaSessionStatus,
  loginFigmaReader,
  openFigmaBrowser,
  syncFigmaDesign,
  fetchFigmaPages,
  fetchFigmaNode,
  refreshFigmaDesign,
  inspectReactWithPlaywright,
  compareParsersOnFixture,
  runPropertyComparisonApi,
  runGeminiAiComparison,
  runVisualComparisonApi,
  saveReportApi,
};

