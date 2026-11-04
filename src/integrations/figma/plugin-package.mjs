import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

const FILES = ['manifest.json', 'code.js', 'ui.html'];
const LAYOUT = 'flat-v2';

function stampOf(sourceDir) {
  return `${LAYOUT}|${FILES.map(name => {
    const stat = fs.statSync(path.join(sourceDir, name));
    return `${name}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
  }).join('|')}`;
}

/** Builds the local plugin zip once and reuses it until the source files change. */
export function ensurePluginPackage(cwd, dataDir) {
  const sourceDir = path.join(cwd, 'figma-plugin');
  for (const name of FILES) {
    if (!fs.existsSync(path.join(sourceDir, name))) {
      throw Object.assign(new Error('ملفات الإضافة غير مكتملة في figma-plugin.'), { status: 500 });
    }
  }
  const stamp = stampOf(sourceDir);
  const cacheDir = path.join(dataDir, 'cache');
  const zipPath = path.join(cacheDir, 'figma-fidelity-connector.zip');
  const metaPath = path.join(cacheDir, 'plugin-package.json');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { meta = null; }
  if (meta?.stamp === stamp && fs.existsSync(zipPath)) {
    return { zipPath, bytes: meta.bytes, builtAt: meta.builtAt, cached: true, href: '/api/plugin/download', name: 'figma-fidelity-connector.zip' };
  }
  const entries = {};
  for (const name of FILES) entries[name] = new Uint8Array(fs.readFileSync(path.join(sourceDir, name)));
  entries['INSTALL.txt'] = new TextEncoder().encode(
    '1. Extract the zip. manifest.json must sit in the same folder as code.js and ui.html.\n2. Open the Figma desktop app, not Chrome extensions.\n3. Plugins, Development, Import plugin from manifest, then select that manifest.json file.\n4. Run Figma Fidelity Connector and paste the pairing code shown in the local dashboard.\n',
  );
  const zipped = zipSync(entries, { level: 6 });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(zipPath, zipped);
  const builtAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify({ stamp, bytes: zipped.length, builtAt, file: 'cache/figma-fidelity-connector.zip' }));
  return { zipPath, bytes: zipped.length, builtAt, cached: false, href: '/api/plugin/download', name: 'figma-fidelity-connector.zip' };
}
