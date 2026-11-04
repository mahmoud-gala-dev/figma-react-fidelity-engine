import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { ensurePluginPackage } from '../src/integrations/figma/plugin-package.mjs';
import { createLocalApi, invokeLocalApi } from '../src/integrations/figma/local-api.mjs';

test('plugin zip is cached locally and served to the dashboard', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-cache-'));
  const first = ensurePluginPackage(process.cwd(), dataDir);
  const second = ensurePluginPackage(process.cwd(), dataDir);
  assert.equal(second.cached, true);
  assert.equal(second.bytes, first.bytes);
  const packed = unzipSync(fs.readFileSync(first.zipPath));
  assert.match(strFromU8(packed['manifest.json']), /Figma Fidelity Connector/);
  assert.equal(packed['figma-fidelity-connector/manifest.json'], undefined);

  const api = createLocalApi({ dataDir, cwd: process.cwd() });
  const info = await invokeLocalApi(api, { url: '/api/plugin/info' });
  assert.equal(info.status, 200);
  assert.equal(info.body.cached, true);
  assert.equal(info.body.href, '/api/plugin/download');
  const file = await invokeLocalApi(api, { url: '/api/plugin/download' });
  assert.equal(file.status, 200);
  assert.equal(file.raw[0], 0x50);
  assert.equal(file.raw[1], 0x4b);
});
