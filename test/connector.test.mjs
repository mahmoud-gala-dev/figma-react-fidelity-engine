import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { zipSync, strToU8 } from 'fflate';
import { importFigmaExportZip } from '../src/lib/import-design.mjs';
import { compareSpecs } from '../src/lib/compare.mjs';
import { assertSyncableDesignUrl } from '../src/integrations/figma/figma-url-parser.mjs';
import { createLocalApi, invokeLocalApi } from '../src/integrations/figma/local-api.mjs';
import { importFigDocument } from '../src/integrations/figma/figma-sync-service.mjs';
import { matchNodes } from '../src/lib/match-nodes.mjs';
import { diffRevisions, fingerprintReference } from '../src/integrations/figma/figma-version-tracker.mjs';
import { readPrivatePng } from '../src/integrations/figma/figma-asset-manager.mjs';

const sample = JSON.parse(fs.readFileSync('public/reference.json', 'utf8'));

test('sample width mismatch stays 75 percent', () => {
  const result = compareSpecs(sample, { ...sample, width: 140 });
  assert.equal(result.score, 75);
  assert.equal(result.passed, 4);
  assert.ok(result.coverage.percentage < 100);
});

test('missing node and FigJam URL are actionable', () => {
  assert.throws(() => assertSyncableDesignUrl('https://www.figma.com/design/abcdefghij/Name'), /node-id/);
  assert.throws(() => assertSyncableDesignUrl('https://www.figma.com/board/abcdefghij/Name?node-id=1-2'), /FigJam/);
});

test('names are not treated as identity', () => {
  const result = matchNodes(
    [{ id: '1:1', name: 'Button', type: 'FRAME', text: 'Buy' }],
    [{ id: '9:9', name: 'Button', type: 'FRAME', text: 'Other' }],
  );
  assert.equal(result.pairs[0].strategy, 'unmatched');
});

test('revision tracker records a changed width', () => {
  const first = fingerprintReference({ nodeId: '1:1', width: 10, text: 'A' });
  const second = fingerprintReference({ nodeId: '1:1', width: 12, text: 'A' });
  const diff = diffRevisions(first, second);
  assert.equal(diff.changed, true);
  assert.equal(diff.fields[0].key, 'width');
});

test('full export zip reads index, side files, geometry, and component png', () => {
  const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
  const view = { tree: { id: '2:9', name: 'Buy ice cream', type: 'FRAME', box: { x: 1, y: 2, w: 112, h: 99 }, fills: [{ hex: '#ff9a62' }], cornerRadius: 6, text: 'Buy ice cream' } };
  const zip = zipSync({
    'meta.json': strToU8(JSON.stringify({ fileKey: 'abcdefghij', fileName: 'Demo', exportedAt: '2020-01-01T00:00:00Z' })),
    'node-index.json': strToU8(JSON.stringify({ '2:9': 'views/2-9.json' })),
    'tokens.json': strToU8('{"color":"#fff"}'),
    'styles.json': strToU8('{"text":[]}'),
    'components.json': strToU8('{"items":[]}'),
    'views/2-9.json': strToU8(JSON.stringify(view)),
    'components/2-9.png': png,
  });
  const result = importFigmaExportZip(zip, { fileKey: 'abcdefghij', nodeId: '2:9' });
  assert.equal(result.ref.width, 112);
  assert.equal(result.ref.text, 'Buy ice cream');
  assert.equal(result.ref.backgroundColor, '#FF9A62');
  assert.equal(result.sideFiles.nodeIndex.present, true);
  assert.equal(result.sideFiles.tokens.present, true);
  assert.equal(result.previewKind, 'component');
  assert.throws(() => importFigmaExportZip(zipSync({
    'meta.json': strToU8(JSON.stringify({ fileKey: 'abcdefghij' })),
    'changes.json': strToU8(JSON.stringify({ mode: 'delta', changedViews: ['2:9'] })),
  }), { fileKey: 'abcdefghij', nodeId: '2:9' }), /Full/);
  const delta = zipSync({
    'meta.json': strToU8(JSON.stringify({ fileKey: 'abcdefghij', fileName: 'Demo' })),
    'changes.json': strToU8(JSON.stringify({ mode: 'delta', changedViews: ['2:9'] })),
    'views/2-9.json': strToU8(JSON.stringify({ tree: { ...view.tree, box: { ...view.tree.box, w: 140 } } })),
  });
  const merged = importFigmaExportZip(delta, { fileKey: 'abcdefghij', nodeId: '2:9', baseline: result.bundleBaseline });
  assert.equal(merged.deltaApplied, true);
  assert.equal(merged.ref.width, 140);
});

test('invalid zip, oversized zip, and incompatible fig fail with actions', async () => {
  assert.throws(() => importFigmaExportZip(Uint8Array.from([1, 2, 3, 4])), /ZIP/);
  assert.throws(() => importFigmaExportZip({ byteLength: 50_000_001 }), /50MB/);
  await assert.rejects(() => importFigDocument(Uint8Array.from([1, 2, 3, 4, 5])), /OpenFig|\.fig/);
});

test('pixelmatch counts one changed pixel', () => {
  const left = new PNG({ width: 2, height: 1 });
  const right = new PNG({ width: 2, height: 1 });
  left.data.fill(255);
  right.data.fill(255);
  right.data[0] = 0;
  const diff = new PNG({ width: 2, height: 1 });
  const count = pixelmatch(left.data, right.data, diff.data, 2, 1, { threshold: 0.1 });
  assert.equal(count, 1);
  assert.ok(PNG.sync.write(diff).length > 8);
});

test('connector rejects foreign sites, bad tokens, and remote URLs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-'));
  const api = createLocalApi({ dataDir: dir });
  const foreign = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/sync', headers: { origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const token = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/hello', headers: { origin: 'null', 'x-fidelity-token': 'wrong-token-value', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(token.status, 401);
  const remote = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/sync', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://169.254.169.254/', fileKey: 'abcdefghij', nodeId: '1:2' }) });
  assert.equal(remote.status, 400);
  assert.equal(readPrivatePng(dir, '../secret'), null);
});

test('plugin protocol accepts a real payload shape and a later change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-'));
  const api = createLocalApi({ dataDir: dir });
  const headers = { origin: 'null', 'content-type': 'application/json', 'x-fidelity-token': api.secret };
  const hello = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/hello', headers, body: JSON.stringify({ editorType: 'figma', fileKey: 'abcdefghij', fileName: 'Library', revision: '1' }) });
  assert.equal(hello.status, 200);
  const mismatch = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/sync', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileKey: 'zzzzzzzz', nodeId: '1:2' }) });
  assert.equal(mismatch.status, 409);
  assert.match(mismatch.body.error, /لا يطابق/);
  const sync = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/sync', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileKey: 'abcdefghij', nodeId: '2:9' }) });
  assert.equal(sync.status, 202);
  const poll = await invokeLocalApi(api, { method: 'GET', url: `/api/figma-connector/poll?session=${hello.body.sessionId}&revision=1&fileKey=abcdefghij&editorType=figma`, headers });
  assert.equal(poll.body.job.id, sync.body.id);
  const node = { id: '2:9', name: 'Card', type: 'FRAME', width: 112, height: 40, text: 'Buy ice cream', backgroundColor: '#FF9A62', visible: true, opacity: 1 };
  const posted = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/result', headers, body: JSON.stringify({ sessionId: hello.body.sessionId, jobId: sync.body.id, fileKey: 'abcdefghij', fileName: 'Library', editorType: 'figma', revision: '1', node, index: [{ id: '2:9', name: 'Card', type: 'FRAME' }] }) });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.change.changed, false);
  assert.match(posted.body.change.summary, /الأولى/);
  const again = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/sync', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileKey: 'abcdefghij', nodeId: '2:9', mode: 'refresh' }) });
  const changed = await invokeLocalApi(api, { method: 'POST', url: '/api/figma-connector/result', headers, body: JSON.stringify({ sessionId: hello.body.sessionId, jobId: again.body.id, fileKey: 'abcdefghij', revision: '2', node: { ...node, width: 140 } }) });
  assert.equal(changed.body.change.changed, true);
  assert.ok(changed.body.change.fields.some(field => field.key === 'width'));
  const status = await invokeLocalApi(api, { method: 'GET', url: '/api/figma-connector/poll?session=' + hello.body.sessionId + '&revision=3&fileKey=abcdefghij&editorType=figma', headers });
  assert.equal(status.status, 200);
  const dashboard = await invokeLocalApi(api, { method: 'GET', url: '/api/figma-connector/status' });
  assert.equal(dashboard.body.state, 'design_changed');
});
