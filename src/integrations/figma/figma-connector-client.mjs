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

export function saveClientReport(html) {
  return fetch('/api/reports/client', { method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }).then(readJson);
}

export function fetchFigmaReaderStatus() {
  return fetch('/api/figma/status', { cache: 'no-store' }).then(readJson);
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
  }).then(readJson);
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
  }).then(readJson);
}

export function fetchFigmaPages() {
  return fetch('/api/figma/pages', { cache: 'no-store' }).then(readJson);
}

export function fetchFigmaNode(nodeId) {
  return fetch(`/api/figma/nodes/${encodeURIComponent(nodeId)}`, { cache: 'no-store' }).then(readJson);
}

export function refreshFigmaDesign({ url = null, nodeId = null, allowDevFallback = false } = {}) {
  return fetch('/api/figma/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, nodeId, allowDevFallback }),
  }).then(readJson);
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
  }).then(readJson);
}

export function runPropertyComparisonApi({ reference, actual, visual = null, options = {} }) {
  return fetch('/api/compare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference, actual, visual, options }),
  }).then(readJson);
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
  loginFigmaReader,
  openFigmaBrowser,
  syncFigmaDesign,
  fetchFigmaPages,
  fetchFigmaNode,
  refreshFigmaDesign,
  inspectReactWithPlaywright,
  compareParsersOnFixture,
  runPropertyComparisonApi,
  runVisualComparisonApi,
  saveReportApi,
};

