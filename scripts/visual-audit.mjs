/**
 * Screenshots via Playwright, pixel-diff with Pixelmatch, and HTML regression
 * report via reg-cli. NO Figma API calls. No fabricated Figma visual baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = process.cwd();
const output = path.join(root, 'out', 'visual');
const expectedDir = path.join(output, 'expected');
const actualDir = path.join(output, 'actual');
const diffDir = path.join(output, 'diff');

for (const p of [expectedDir, actualDir, diffDir]) fs.mkdirSync(p, { recursive: true });

const originalFigma = path.join(root, 'input', 'figma-expected.png');
const expectedPath = path.join(expectedDir, 'item.png');
const actualPath = path.join(actualDir, 'item.png');
const diffPath = path.join(diffDir, 'item.png');
const demo = process.argv.includes('--demo');

for (const old of [expectedPath, actualPath, diffPath, path.join(output, 'reg-cli-report.html'), path.join(output, 'reg.json')]) {
  if (fs.existsSync(old)) fs.unlinkSync(old);
}

const base = process.env.MVP_URL || 'http://127.0.0.1:5173';
const launchedAt = new Date().toISOString();
const manifest = { time: launchedAt, source: null, pixelSimilarity: null, diffPixels: null, regCli: false, notes: [] };

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="actual-canvas"]').screenshot({ path: actualPath, animations: 'disabled' });

  if (fs.existsSync(originalFigma)) {
    fs.copyFileSync(originalFigma, expectedPath);
    manifest.source = 'genuine-figma-image-user-supplied';
    manifest.notes.push('User-supplied genuine image; caller must confirm same component and screenshot geometry.');
  } else if (demo) {
    await page.locator('[data-testid="reference-canvas"]').screenshot({ path: expectedPath, animations: 'disabled' });
    manifest.source = 'synthetic-reference-rendered-from-json';
    manifest.notes.push('DEMO ONLY. Expected screenshot is a React rendition of JSON; NOT a true Figma screenshot.');
  } else {
    manifest.source = 'missing';
    manifest.notes.push('No genuine Figma screenshot. Visual score withheld. Use input/figma-expected.png or --demo to create clearly labelled synthetic baseline.');
  }

  if (manifest.source !== 'missing') {
    const expected = PNG.sync.read(fs.readFileSync(expectedPath));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));
    manifest.expectedPixels = { width: expected.width, height: expected.height };
    manifest.actualPixels = { width: actual.width, height: actual.height };

    if (expected.width !== actual.width || expected.height !== actual.height) {
      manifest.notes.push('Dimension mismatch; no resize is performed. Pixel similarity is withheld.');
    } else {
      const diff = new PNG({ width: expected.width, height: expected.height });
      const mismatched = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, {
        threshold: 0.1,
        includeAA: false
      });
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      manifest.diffPixels = mismatched;
      manifest.pixelSimilarity = +(100 * (1 - mismatched / (expected.width * expected.height))).toFixed(2);

      const regCliPath = path.join(root, 'node_modules', 'reg-cli', 'dist', 'cli.js');
      try {
        if (fs.existsSync(regCliPath)) {
          execFileSync(process.execPath, [
            regCliPath,
            actualDir,
            expectedDir,
            diffDir,
            '-R', path.join(output, 'reg-cli-report.html'),
            '-J', path.join(output, 'reg.json'),
            '-I',
            '-M', '0.1'
          ], { cwd: root, stdio: 'pipe', timeout: 60000 });
          manifest.regCli = true;
        } else {
          const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
          execFileSync(cmd, [
            'reg-cli',
            actualDir,
            expectedDir,
            diffDir,
            '-R', path.join(output, 'reg-cli-report.html'),
            '-J', path.join(output, 'reg.json'),
            '-I',
            '-M', '0.1'
          ], { cwd: root, stdio: 'pipe', timeout: 60000, shell: true });
          manifest.regCli = true;
        }
      } catch (error) {
        manifest.notes.push('reg-cli report was not generated: ' + String(error.message).slice(0, 300));
      }
    }
  }
} catch (e) {
  manifest.notes.push('Capture could not complete: ' + e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}

fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const esc = v => String(v ?? '—').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
const have = fs.existsSync(expectedPath) && fs.existsSync(actualPath);
const image = (name, file) => fs.existsSync(file) ? `<figure><img alt="${esc(name)}" src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"><figcaption>${esc(name)}</figcaption></figure>` : '';
const caution = manifest.source === 'synthetic-reference-rendered-from-json'
  ? 'مقارنة تجريبية بمرجع مصنوع من بيانات JSON، وليست مقارنة مباشرة بلقطة Figma الأصلية.'
  : manifest.source === 'genuine-figma-image-user-supplied'
    ? 'المصدر صورة أُدخلت يدويًا باعتبارها من Figma. يلزم التحقق من تطابق النطاق والحجم.'
    : 'لا تتوفر صورة مرجعية من Figma. لم نحسب نسبة بصرية.';

const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير المقارنة البصرية</title><style>body{max-width:1100px;margin:40px auto;font:16px Tahoma,Arial;color:#172d47;background:#fafbfe;padding:0 20px}header{background:#152e51;color:white;border-radius:16px;padding:30px}h1{margin:0 0 10px}h2{color:#1c477b}.score{font-size:46px;font-weight:bold;margin:20px 0}.alert{background:#fffaea;border-right:4px solid #ca8921;padding:16px;line-height:1.9}.imgs{display:flex;gap:14px;flex-wrap:wrap}figure{background:white;padding:12px;border-radius:12px;border:1px solid #e0e4ed;margin:0;max-width:100%}figure img{max-width:100%;height:auto}figcaption{padding:9px;color:#657}footer{font-size:12px;margin:25px 0;color:#678}li{line-height:1.8}@media print{body{margin:0}header{break-inside:avoid}}</style><header><h1>تقرير الاختلافات البصرية</h1><div>Figma Fidelity | ${esc(launchedAt)}</div></header><div class="alert">${esc(caution)}</div><div class="score">${manifest.pixelSimilarity === null ? 'غير متاح' : manifest.pixelSimilarity + '%'}</div><p>النسبة = 100 × (1 − عدد البكسلات المختلفة ÷ إجمالي البكسلات) باستخدام Pixelmatch. لا يُستنتج منها وحدها التطابق الوظيفي أو قابلية الوصول.</p><div class="imgs">${have ? image('المرجع', expectedPath) : ''}${image('تنفيذ React', actualPath)}${image('خريطة الاختلافات', diffPath)}</div><h2>التحقق والقيود</h2><ul>${manifest.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul><footer>تقرير MVP | ${manifest.regCli ? '<a href="reg-cli-report.html">عرض تقرير reg-cli التفاعلي</a>' : 'لم يتم توليد تقرير reg-cli'}</footer></html>`;

fs.writeFileSync(path.join(output, 'visual-report.html'), html);
console.log(JSON.stringify({ source: manifest.source, pixelSimilarity: manifest.pixelSimilarity, regCli: manifest.regCli, notes: manifest.notes, output }, null, 2));
