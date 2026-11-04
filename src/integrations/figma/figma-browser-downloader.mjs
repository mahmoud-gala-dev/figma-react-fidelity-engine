/**
 * Downloads a Figma Design file by driving the logged-in browser UI:
 * Main menu → File → Save local copy.
 * The session stays inside Playwright's persistent profile. Cookies are not read or copied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertSyncableDesignUrl } from './figma-url-parser.mjs';

const FIG_MAX = 50_000_000;

export function failDownload(reason, message, recovery = '') {
  const error = new Error(message);
  error.reason = reason;
  error.recovery = recovery;
  return error;
}

export function canonicalDesignUrl(parsed) {
  const slug = encodeURIComponent(parsed.fileName || 'design');
  const node = String(parsed.nodeId).replace(':', '-');
  return `https://www.figma.com/design/${parsed.fileKey}/${slug}?node-id=${node}`;
}

export function assertNavigationTarget(url, fileKey) {
  let parsed;
  try { parsed = assertSyncableDesignUrl(url); }
  catch (error) {
    error.reason = error.code || 'invalid_url';
    throw error;
  }
  const canonical = canonicalDesignUrl(parsed);
  if (url !== canonical || parsed.fileKey !== fileKey) {
    throw failDownload('permission_denied', 'التنزيل يفتح رابط التصميم المُعاد بناؤه فقط.', 'الصق رابط ملف Design من figma.com.');
  }
  return canonical;
}

export function projectRelative(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw failDownload('download_failed', 'مسار الحفظ خارج مجلد المشروع.');
  }
  return rel.split(path.sep).join('/');
}

export function assertDownloadedFig(bytes, suggestedName = '') {
  const name = String(suggestedName || '');
  if (/\.(jam|deck|buzz|site|make)$/i.test(name)) {
    throw failDownload('unsupported_document', `الملف الذي نزل هو ${path.extname(name)} وليس تصميم Figma.`, 'افتح رابط Design وليس FigJam أو Slides.');
  }
  if (name && !/\.fig$/i.test(name)) {
    throw failDownload('invalid_fig', `المتصفح نزّل «${name.slice(0, 80)}» وليس ملف .fig.`, 'تأكد أن الأمر المنفَّذ هو File → Save local copy وأن التصدير غير معطّل.');
  }
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (data.length < 64 || data.length > FIG_MAX) {
    throw failDownload('invalid_fig', 'حجم الملف لا يطابق مستند .fig صالحًا.', 'أعد التنزيل. إن تكررت المشكلة فالملف أكبر من 50MB أو التنزيل لم يكتمل.');
  }
  const zip = data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  const kiwi = data.subarray(0, 4).toString('utf8') === 'fig-';
  if (!zip && !kiwi) {
    throw failDownload('invalid_fig', 'الملف الذي وصل ليس أرشيف .fig معروفًا.', 'لم يُحتسب التنزيل ناجحًا. أعد المحاولة من ملف تملك صلاحية نسخه.');
  }
  return data;
}

async function visibleRole(page, role, name) {
  const group = page.getByRole(role, { name });
  if (!group || (await group.count()) < 1) return null;
  const first = group.first();
  if (!(await first.isVisible())) return null;
  return first;
}

async function findItem(page, pattern) {
  for (const role of ['menuitem', 'menuitemcheckbox', 'button', 'link']) {
    const found = await visibleRole(page, role, pattern);
    if (found) return found;
  }
  return null;
}

async function isDisabled(item) {
  const aria = await item.getAttribute('aria-disabled');
  if (aria === 'true') return true;
  const disabled = await item.getAttribute('disabled');
  return disabled != null && disabled !== 'false';
}

function hostnameOf(value) {
  try { return new URL(value).hostname; }
  catch { return ''; }
}

async function dismissCookieBanner(page) {
  const consent = await visibleRole(page, 'button', /allow all cookies|accept all|قبول كل ملفات تعريف الارتباط|قبول الكل/i);
  if (consent) await consent.click();
}

async function loginWall(page) {
  const current = page.url();
  if (/figma\.com\/(login|signup)(\/|$|\?)/.test(current)) return true;
  if (/accounts\.google\.com|login\.microsoftonline\.com|okta\.com|accounts\.figma\.com/i.test(current)) return true;
  const login = await visibleRole(page, 'button', /^(log in|continue with|تسجيل الدخول)/i);
  return Boolean(login);
}

export async function driveSaveLocalCopy(page, {
  fileKey,
  targetUrl,
  onProgress = () => {},
  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
  loginTimeoutMs = 5 * 60 * 1000,
  editorTimeoutMs = 90 * 1000,
  downloadTimeoutMs = 60 * 1000,
} = {}) {
  const url = assertNavigationTarget(targetUrl, fileKey);
  onProgress({ state: 'opening_design', message: 'جارٍ فتح التصميم في المتصفح المحلي.', recovery: '' });
  await page.goto(url);
  const started = now();
  let sawLogin = false;
  let editorSeenAt = 0;
  let menu = null;
  while (now() - started < loginTimeoutMs) {
    await dismissCookieBanner(page);
    const current = page.url();
    menu = await visibleRole(page, 'button', /main menu|القائمة الرئيسية/i);
    const onFile = hostnameOf(current) === 'www.figma.com' && current.includes(`/design/${fileKey}`);
    if (menu && onFile) {
      if (!editorSeenAt) editorSeenAt = now();
      onProgress({ state: 'waiting_for_editor', message: 'ظهر المحرر. انتظار استقرار القائمة قبل الحفظ.', recovery: '' });
      if (now() - editorSeenAt >= Math.min(1500, editorTimeoutMs)) break;
    } else if (await loginWall(page)) {
      sawLogin = true;
      editorSeenAt = 0;
      onProgress({
        state: 'awaiting_login',
        message: 'نافذة المتصفح تنتظر تسجيل الدخول. أكمل الدخول بنفسك، بما في ذلك التحقق بخطوتين إن طُلب.',
        recovery: 'لا تُغلق النافذة. بعد أن يفتح التصميم نفسه يتابع التنزيل تلقائيًا.',
      });
    } else {
      editorSeenAt = 0;
      onProgress({ state: 'opening_design', message: 'بانتظار اكتمال تحميل محرر Figma.', recovery: '' });
    }
    if (!menu || !onFile) {
      if (!sawLogin && now() - started >= editorTimeoutMs && hostnameOf(current) === 'www.figma.com') {
        throw failDownload('editor_timeout', 'المحرر لم يظهر خلال المهلة.', 'تأكد أن الحساب يستطيع فتح هذا الملف، ثم أعد تنزيل التصميم.');
      }
    }
    await sleep(400);
  }
  if (!menu) {
    throw failDownload(
      sawLogin ? 'login_timeout' : 'editor_timeout',
      sawLogin ? 'انتهت مهلة تسجيل الدخول قبل فتح التصميم.' : 'لم يظهر زر Main menu.',
      sawLogin ? 'أعد المحاولة وسجّل الدخول في النافذة الظاهرة قبل انتهاء المهلة.' : 'واجهة Figma تغيّرت أو الصفحة ليست محرر تصميم.',
    );
  }

  onProgress({ state: 'saving_local_copy', message: 'تنفيذ Main menu → File → Save local copy. الملف في Figma لا يُعدَّل.', recovery: '' });
  await menu.click();
  let saveItem = await findItem(page, /save local copy|حفظ نسخة محلية/i);
  if (!saveItem) {
    const fileItem = await findItem(page, /^file$|^ملف$/i);
    if (!fileItem) {
      const labels = typeof page.menuLabels === 'function' ? await page.menuLabels() : [];
      throw failDownload('ui_changed', `قائمة Figma لا تحتوي File أو Save local copy. الظاهر: ${labels.slice(0, 12).join(' | ').slice(0, 300) || 'لا عناصر'}.`, 'حدّث الواجهة إن تغيّر اسم الأمر، أو اطلب من مالك الملف تفعيل النسخ.');
    }
    if (await isDisabled(fileItem)) {
      throw failDownload('export_disabled', 'قائمة File معطّلة.', 'مالك الملف يمنع النسخ أو التصدير. لا يمكن تجاوز هذا القيد.');
    }
    await fileItem.click();
    saveItem = await findItem(page, /save local copy|حفظ نسخة محلية/i);
  }
  if (!saveItem) {
    const labels = typeof page.menuLabels === 'function' ? await page.menuLabels() : [];
    throw failDownload('export_disabled', `الأمر Save local copy غير موجود. الظاهر: ${labels.slice(0, 12).join(' | ').slice(0, 300) || 'لا عناصر'}.`, 'إن كنت مشاهدًا، فالمالك ربما عطّل «يمكن للمشاهدين النسخ والمشاركة والتصدير».');
  }
  if (await isDisabled(saveItem)) {
    throw failDownload('export_disabled', 'الأمر Save local copy ظاهر لكنه معطّل.', 'لا يتم تجاوز قيود التصدير. اطلب صلاحية النسخ من مالك الملف.');
  }
  let download;
  try {
    download = await Promise.all([
      page.waitForEvent('download', { timeout: downloadTimeoutMs }),
      saveItem.click(),
    ]).then(result => result[0]);
  } catch (error) {
    throw failDownload('download_failed', 'لم يبدأ تنزيل ملف .fig بعد الضغط على Save local copy.', 'إن ظهرت نافذة حفظ خارج المتصفح فاختر مجلد التنزيلات، أو أعد المحاولة. لا يُحتسب الأمر نجاحًا بلا ملف.');
  }
  return download;
}

export function bindPlaywrightPage(page) {
  return {
    goto: (url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }),
    url: () => page.url(),
    getByRole: (role, options) => page.getByRole(role, options),
    waitForEvent: (name, options) => page.waitForEvent(name, options),
    menuLabels: async () => {
      const items = page.getByRole('menuitem');
      const texts = await items.allInnerTexts();
      return texts.map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30);
    },
  };
}

export function installedBrowserProfile(env = process.env) {
  const local = env.LOCALAPPDATA;
  if (!local) return null;
  const candidates = [
    { channel: 'chrome', exe: 'chrome.exe', dir: path.join(local, 'Google', 'Chrome', 'User Data') },
    { channel: 'msedge', exe: 'msedge.exe', dir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
  ];
  return candidates.find(item => fs.existsSync(path.join(item.dir, 'Local State'))) || null;
}

export function lastUsedProfileDirectory(userDataDir) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'));
    const name = state?.profile?.last_used;
    if (typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(name)) return name;
  } catch { /* the default profile is used when Local State cannot be read */ }
  return 'Default';
}

function browserRunning(exe) {
  return new Promise(resolve => {
    import('node:child_process').then(({ execFile }) => {
      execFile('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH'], { windowsHide: true }, (error, stdout) => {
        resolve(!error && new RegExp(exe, 'i').test(stdout || ''));
      });
    }).catch(() => resolve(false));
  });
}

async function connectExistingChrome() {
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 2000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('no browser context');
  return { context, browserName: 'existing-chrome', ownsBrowser: false, session: 'existing-browser' };
}

async function launchInstalledProfile({ userDataDir, channel, downloadDir, profileDirectory }) {
  const { chromium } = await import('playwright');
  const options = {
    headless: false,
    acceptDownloads: true,
    downloadsPath: downloadDir,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    args: [`--profile-directory=${profileDirectory}`],
  };
  if (channel) options.channel = channel;
  return chromium.launchPersistentContext(userDataDir, options);
}

export async function launchFigmaBrowser({
  profileDir,
  downloadDir,
  connectExisting = connectExistingChrome,
  launchPersistent = launchInstalledProfile,
  resolveProfile = installedBrowserProfile,
  isBrowserRunning = browserRunning,
} = {}) {
  fs.mkdirSync(downloadDir, { recursive: true });
  try {
    const attached = await connectExisting();
    if (attached?.context) return attached;
  } catch { /* Chrome is not listening on the local debugging port */ }

  const installed = resolveProfile();
  if (installed && await isBrowserRunning(installed.exe)) {
    throw failDownload(
      'browser_busy',
      'المتصفح مفتوح، لكن Windows لا يسمح بفتح جلسة الحساب نفسها في نافذة ثانية.',
      'أغلق كل نوافذ Chrome أو Edge من شريط المهام، ثم اضغط تنزيل التصميم. ستُفتح نافذة المتصفح نفسه بجلسة حسابك، بدون تسجيل دخول جديد وبدون متصفح فارغ.',
    );
  }
  if (installed) {
    try {
      const context = await launchPersistent({
        userDataDir: installed.dir,
        channel: installed.channel,
        downloadDir,
        profileDirectory: lastUsedProfileDirectory(installed.dir),
      });
      return { context, browserName: installed.channel, ownsBrowser: true, session: 'installed-profile' };
    } catch (error) {
      const busy = /singleton|in use|already|existing browser/i.test(String(error?.message || ''));
      if (busy) {
        throw failDownload('browser_busy', 'جلسة المتصفح مستخدمة في نافذة أخرى.', 'أغلق المتصفح بالكامل ثم أعد تنزيل التصميم حتى تُستخدم نفس الجلسة.');
      }
      throw error;
    }
  }

  fs.mkdirSync(profileDir, { recursive: true });
  try {
    const context = await launchPersistent({ userDataDir: profileDir, channel: undefined, downloadDir, profileDirectory: 'Default' });
    return { context, browserName: 'chromium', ownsBrowser: true, session: 'blank-profile' };
  } catch {
    throw failDownload('browser_missing', 'تعذر فتح Chrome أو Edge.', 'ثبّت Google Chrome أو نفّذ npx playwright install chromium ثم أعد المحاولة.');
  }
}

export function createFigmaBrowserDownloader({
  profileDir,
  downloadDir,
  projectRoot,
  launchContext = launchFigmaBrowser,
  importDocument,
  now = () => Date.now(),
  sleep,
  loginTimeoutMs,
  editorTimeoutMs,
  downloadTimeoutMs,
} = {}) {
  if (!profileDir || !downloadDir || !projectRoot) {
    throw failDownload('download_failed', 'مجلدات التنزيل المحلية غير مهيأة.');
  }
  const profile = path.resolve(profileDir);
  const downloads = path.resolve(downloadDir);
  projectRelative(projectRoot, profile);
  projectRelative(projectRoot, downloads);

  return {
    async download({ url, fileKey, nodeId, fileName, onProgress = () => {} }) {
      const targetUrl = assertNavigationTarget(url, fileKey);
      onProgress({ state: 'launching', message: 'جارٍ استخدام جلسة Chrome أو Edge الحالية.', recovery: 'إن كان المتصفح مفتوحًا من دون منفذ تصحيح، أغلق نوافذه ثم أعد المحاولة. لن يُفتح متصفح فارغ.' });
      let launched;
      try {
        launched = await launchContext({ profileDir: profile, downloadDir: downloads });
      } catch (error) {
        if (error?.reason) throw error;
        const busy = /in use|already|profile|singleton/i.test(String(error?.message || ''));
        throw failDownload(busy ? 'browser_busy' : 'browser_missing', busy ? 'جلسة المتصفح مستخدمة في نافذة أخرى.' : 'تعذر تشغيل المتصفح.', busy ? 'أغلق المتصفح بالكامل ثم أعد تنزيل التصميم.' : 'ثبّت Chrome أو Edge.');
      }
      const context = launched.context;
      const sessionMessage = launched.session === 'existing-browser'
        ? 'التبويب داخل المتصفح المفتوح، بنفس جلسة الحساب.'
        : launched.session === 'installed-profile'
          ? 'فُتحت نافذة المتصفح المثبت بجلسة حسابك المحفوظة.'
          : 'لا يوجد Chrome أو Edge. فُتح متصفح احتياطي بلا جلسة.';
      onProgress({ state: 'launching', message: sessionMessage, recovery: '' });
      let rawPage;
      let closeTab = false;
      try {
        const pages = typeof context.pages === 'function' ? context.pages() : [];
        const existing = pages.find(item => {
          try { return String(item.url()).includes(`/design/${fileKey}`); }
          catch { return false; }
        });
        rawPage = existing || await context.newPage();
        closeTab = !existing && launched.ownsBrowser === false;
        const page = typeof rawPage.context === 'function' ? bindPlaywrightPage(rawPage) : rawPage;
        const artifact = await driveSaveLocalCopy(page, {
          fileKey, targetUrl, onProgress, sleep, now, loginTimeoutMs, editorTimeoutMs, downloadTimeoutMs,
        });
        onProgress({ state: 'validating', message: 'التحقق من أن الملف أرشيف .fig.', recovery: '' });
        const suggested = typeof artifact.suggestedFilename === 'function' ? artifact.suggestedFilename() : '';
        const dest = path.join(downloads, `${fileKey}-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.fig`);
        await artifact.saveAs(dest);
        const bytes = fs.readFileSync(dest);
        try {
          assertDownloadedFig(bytes, suggested);
        } catch (error) {
          error.relativePath = projectRelative(projectRoot, dest);
          throw error;
        }
        onProgress({ state: 'parsing', message: 'قراءة الملف عبر OpenFig واستخراج العقدة المطلوبة.', recovery: '' });
        const parse = importDocument || (async (payload, options) => {
          const { importFigDocument } = await import('./figma-sync-service.mjs');
          return importFigDocument(payload, options);
        });
        let imported;
        try {
          imported = await parse(bytes, { nodeId, fileName: fileName || `${fileKey}.fig` });
        } catch (error) {
          const missing = /غير موجود/.test(error.message || '');
          const wrapped = failDownload(missing ? 'node_missing' : 'invalid_fig', error.message, missing ? 'الملف محفوظ. اختر عقدة أخرى، أو انسخ رابط العنصر من Figma.' : 'OpenFig لم يتعرّف على هذا الإصدار. الملف محفوظ للمراجعة ولم يُحتسب مرجعًا.');
          wrapped.relativePath = projectRelative(projectRoot, dest);
          throw wrapped;
        }
        let thumbnail = null;
        try {
          const { parseFig } = await import('openfig-core');
          thumbnail = parseFig(bytes).thumbnail || null;
        } catch { thumbnail = null; }
        return {
          ...imported,
          relativePath: projectRelative(projectRoot, dest),
          byteLength: bytes.length,
          browser: launched.browserName || 'playwright',
          suggestedName: suggested,
          thumbnail,
          acquiredBy: 'playwright-save-local-copy',
        };
      } finally {
        if (launched.ownsBrowser !== false) await context.close().catch(() => {});
        else if (closeTab && rawPage) await rawPage.close().catch(() => {});
      }
    },
  };
}

export class FigmaBrowserDownloader {
  constructor({
    cwd = process.cwd(),
    userDataDir = path.resolve(process.cwd(), '.browser-profile'),
    downloadsDir = path.resolve(process.cwd(), 'input', 'downloads'),
    loginTimeoutMs,
  } = {}) {
    this.cwd = cwd;
    this.userDataDir = userDataDir;
    this.downloadsDir = downloadsDir;
    this.status = { state: 'idle', message: 'جاهز. التنزيل يستخدم جلسة Chrome أو Edge الحالية.' };
    this.impl = createFigmaBrowserDownloader({
      projectRoot: cwd,
      profileDir: userDataDir,
      downloadDir: downloadsDir,
      loginTimeoutMs,
    });
  }

  getStatus() {
    return this.status;
  }

  validateUrl(url) {
    return assertSyncableDesignUrl(url);
  }

  validateFigFormat(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`الملف غير موجود في المسار: ${filePath}`);
    const bytes = fs.readFileSync(filePath);
    if (!bytes || bytes.length === 0) throw new Error('الملف فارغ (0 بايت).');
    const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const kiwi = bytes.length >= 8 && bytes.subarray(0, 8).toString('utf8') === 'fig-kiwi';
    if (!zip && !kiwi) throw new Error('الملف ليس مستند .fig.');
    return { valid: true, size: bytes.length, format: zip ? 'zip-container' : 'kiwi-binary', headerOnly: true };
  }

  async download(url, options = {}) {
    const parsed = this.validateUrl(url);
    const safeUrl = canonicalDesignUrl(parsed);
    const ui = {
      launching: 'launching_browser',
      opening_design: 'navigating',
      awaiting_login: 'waiting_for_login',
      waiting_for_editor: 'loading_editor',
      saving_local_copy: 'executing_save',
      validating: 'saving_file',
      parsing: 'parsing_openfig',
    };
    this.status = { state: 'launching_browser', message: 'جارٍ فتح المتصفح المحلي.' };
    try {
      const result = await this.impl.download({
        url: safeUrl,
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        fileName: parsed.fileName,
        onProgress: (patch) => {
          this.status = { state: ui[patch.state] || patch.state, message: patch.message, recovery: patch.recovery || '' };
          options.onProgress?.(this.status.state, patch.message);
        },
      });
      if (!result?.relativePath || !result?.ref) {
        throw failDownload('download_failed', 'التنزيل لم يُرجع ملفًا مقروءًا.');
      }
      const meta = { relativePath: result.relativePath, fileKey: parsed.fileKey };
      fs.mkdirSync(this.downloadsDir, { recursive: true });
      fs.writeFileSync(path.join(this.downloadsDir, 'last.json'), JSON.stringify(meta));
      this.status = { state: 'done', message: `حُفظ ${result.relativePath} وقُرئت العقدة ${result.ref.nodeId}.` };
      return {
        ok: true,
        source: 'openfig-native-file',
        fileKey: parsed.fileKey,
        nodeId: result.ref.nodeId,
        fileName: parsed.fileName || `${parsed.fileKey}.fig`,
        figPath: result.relativePath,
        ref: result.ref,
        index: result.index,
        parsedCount: result.parsedCount,
        byteLength: result.byteLength,
        acquiredBy: result.acquiredBy,
      };
    } catch (error) {
      this.status = { state: 'error', message: error.message, recovery: error.recovery || '', reason: error.reason || 'download_failed' };
      throw error;
    }
  }

  async selectNode(nodeId) {
    const metaPath = path.join(this.downloadsDir, 'last.json');
    if (!fs.existsSync(metaPath)) {
      throw failDownload('node_missing', 'لا يوجد ملف .fig محفوظ من تنزيل سابق.', 'اضغط تحميل التصميم أولًا.');
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const absolute = path.resolve(this.cwd, meta.relativePath || '');
    const root = path.resolve(this.downloadsDir);
    const rel = path.relative(root, absolute);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(absolute)) {
      throw failDownload('download_failed', 'ملف التنزيل غير موجود داخل مجلد التنزيلات.');
    }
    const { importFigDocument } = await import('./figma-sync-service.mjs');
    const { assertNodeId } = await import('./figma-sync-service.mjs');
    const imported = await importFigDocument(fs.readFileSync(absolute), { nodeId: assertNodeId(nodeId), fileName: path.basename(absolute) });
    return { ok: true, ref: imported.ref, index: imported.index, figPath: meta.relativePath, sourceType: 'openfig-native-file' };
  }
}

