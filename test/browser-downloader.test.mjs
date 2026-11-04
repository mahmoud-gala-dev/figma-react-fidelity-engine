import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FigmaBrowserDownloader } from '../src/integrations/figma/figma-browser-downloader.mjs';

test('FigmaBrowserDownloader — URL validation and security', () => {
  const downloader = new FigmaBrowserDownloader();

  // Valid design URL
  const valid = downloader.validateUrl('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1');
  assert.equal(valid.fileKey, 'vMYpz8Jc3EzVUsLQCDx3Jd');
  assert.equal(valid.nodeId, '0:1');

  // SSRF attempts rejected
  assert.throws(() => downloader.validateUrl('http://169.254.169.254/latest/meta-data'), /HTTPS/i);
  assert.throws(() => downloader.validateUrl('https://malicious-site.com/design/test?node-id=0-1'), /figma\.com/);

  // Missing node ID rejected
  assert.throws(() => downloader.validateUrl('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/title'), /node-id/);

  // FigJam rejected
  assert.throws(() => downloader.validateUrl('https://www.figma.com/board/vMYpz8Jc3EzVUsLQCDx3Jd/board?node-id=0-1'), /FigJam/);
});

test('FigmaBrowserDownloader — .fig format validator', () => {
  const tmpDir = path.resolve('out', 'test-fig-check');
  fs.mkdirSync(tmpDir, { recursive: true });

  const downloader = new FigmaBrowserDownloader({ downloadsDir: tmpDir });

  // 1. Missing file throws
  assert.throws(() => downloader.validateFigFormat(path.join(tmpDir, 'nonexistent.fig')), /غير موجود/);

  // 2. Empty file throws
  const emptyFile = path.join(tmpDir, 'empty.fig');
  fs.writeFileSync(emptyFile, Buffer.alloc(0));
  assert.throws(() => downloader.validateFigFormat(emptyFile), /فارغ/);

  // 3. Corrupt non-fig header throws
  const corruptFile = path.join(tmpDir, 'corrupt.fig');
  const corruptBuf = Buffer.alloc(100, 0x41); // 100 bytes of 'A'
  fs.writeFileSync(corruptFile, corruptBuf);
  assert.throws(() => downloader.validateFigFormat(corruptFile), /أرشيف \.fig|مستند \.fig/);

  // 4. Valid Zip-based fig header passes
  const zipFigFile = path.join(tmpDir, 'valid-zip.fig');
  const zipBuf = Buffer.alloc(100);
  zipBuf[0] = 0x50; zipBuf[1] = 0x4b; zipBuf[2] = 0x03; zipBuf[3] = 0x04;
  fs.writeFileSync(zipFigFile, zipBuf);
  const resultZip = downloader.validateFigFormat(zipFigFile);
  assert.equal(resultZip.valid, true);
  assert.equal(resultZip.format, 'zip-container');

  // 5. Valid Kiwi-binary fig header passes
  const kiwiFigFile = path.join(tmpDir, 'valid-kiwi.fig');
  const kiwiBuf = Buffer.alloc(100);
  kiwiBuf.write('fig-kiwi-binary-document-test-data', 0, 'utf8');
  fs.writeFileSync(kiwiFigFile, kiwiBuf);
  const resultKiwi = downloader.validateFigFormat(kiwiFigFile);
  assert.equal(resultKiwi.valid, true);
  assert.equal(resultKiwi.format, 'kiwi-binary');
});

test('open Chrome is reused and a blank profile is not launched', async () => {
  const { launchFigmaBrowser } = await import('../src/integrations/figma/figma-browser-downloader.mjs');
  let launched = false;
  const result = await launchFigmaBrowser({
    profileDir: path.resolve('out', 'unused-profile'),
    downloadDir: path.resolve('out', 'test-downloads'),
    connectExisting: async () => ({ context: { pages() { return []; } }, browserName: 'existing-chrome', ownsBrowser: false, session: 'existing-browser' }),
    launchPersistent: async () => { launched = true; throw new Error('blank profile'); },
    resolveProfile: () => ({ channel: 'chrome', exe: 'chrome.exe', dir: 'C:\\Chrome' }),
    isBrowserRunning: async () => true,
  });
  assert.equal(result.session, 'existing-browser');
  assert.equal(launched, false);
});

test('running Chrome without a debug port does not open a second browser', async () => {
  const { launchFigmaBrowser } = await import('../src/integrations/figma/figma-browser-downloader.mjs');
  let launched = false;
  await assert.rejects(
    () => launchFigmaBrowser({
      profileDir: path.resolve('out', 'unused-profile'),
      downloadDir: path.resolve('out', 'test-downloads'),
      connectExisting: async () => { throw new Error('no port'); },
      launchPersistent: async () => { launched = true; },
      resolveProfile: () => ({ channel: 'chrome', exe: 'chrome.exe', dir: 'C:\\Chrome' }),
      isBrowserRunning: async () => true,
    }),
    /نافذة ثانية/,
  );
  assert.equal(launched, false);
});

test('FigmaBrowserDownloader — Status state reporting', () => {
  const downloader = new FigmaBrowserDownloader();
  const st = downloader.getStatus();
  assert.equal(st.state, 'idle');
  assert.ok(st.message);
});

test('header sniff is not a successful .fig acquisition', async () => {
  const { assertDownloadedFig, driveSaveLocalCopy, canonicalDesignUrl } = await import('../src/integrations/figma/figma-browser-downloader.mjs');
  const tiny = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  assert.throws(() => assertDownloadedFig(tiny, 'design.fig'), /صالح/);

  const clicks = [];
  let downloadStarted = false;
  let clock = 0;
  const fileKey = 'vMYpz8Jc3EzVUsLQCDx3Jd';
  const targetUrl = canonicalDesignUrl({ fileKey, fileName: 'design', nodeId: '0:1' });
  const save = {
    text: 'Save local copy',
    async isVisible() { return true; },
    async getAttribute(name) { return name === 'aria-disabled' ? 'true' : null; },
    async click() { clicks.push('save'); },
  };
  const page = {
    async goto() {},
    url: () => targetUrl,
    getByRole(role, { name }) {
      const pool = role === 'button'
        ? [{ text: 'Main menu', async isVisible() { return true; }, async getAttribute() { return null; }, async click() { clicks.push('menu'); } }]
        : role === 'menuitem'
          ? [
            { text: 'File', async isVisible() { return true; }, async getAttribute() { return null; }, async click() { clicks.push('file'); } },
            save,
          ]
          : [];
      const found = pool.filter(entry => name.test(entry.text));
      return { async count() { return found.length; }, first: () => found[0] };
    },
    async menuLabels() { return ['File', 'Save local copy']; },
    async waitForEvent() { downloadStarted = true; throw new Error('should not download'); },
  };
  await assert.rejects(
    () => driveSaveLocalCopy(page, {
      fileKey,
      targetUrl,
      now: () => clock,
      sleep: async () => { clock += 500; },
      loginTimeoutMs: 20000,
      editorTimeoutMs: 20000,
    }),
    /معطّل/,
  );
  assert.equal(downloadStarted, false);
  assert.equal(clicks.includes('save'), false);
});
