import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { assertSyncableDesignUrl, parseFigmaUrl } from '../figma/figma-url-parser.mjs';
import { normalizeFigmaReaderNode } from '../../design/normalizer/design-normalizer.mjs';

const SAFE_NODE_ID_RE = /^\d+[:-]\d+$/;
const SAFE_ACCOUNT_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * Disclosed internal web APIs and browser interactions performed by @leogcode/figma-reader v0.4.2:
 * Audited directly from `node_modules/@leogcode/figma-reader/dist/figma-web.js`.
 */
export const FIGMA_READER_INTERNAL_API_AUDIT = Object.freeze({
  package: '@leogcode/figma-reader',
  version: '0.4.2',
  license: 'MIT',
  repository: 'https://github.com/LeoGCode/figma-reader',
  internalWebEndpoints: [
    {
      endpoint: 'GET https://www.figma.com/api/session/state',
      purpose: 'Used by whoami() during status/login checks to verify whether the browser profile has an active authenticated Figma user session.',
      headers: ['cookie (from browser CDP Storage.getCookies)', 'accept: application/json', 'x-csrf-bypass: yes'],
      modifiesData: false,
    },
    {
      endpoint: 'GET https://www.figma.com/api/recent_files',
      purpose: 'Used only when invoking list-files --source web to list recently viewed files.',
      headers: ['cookie (from browser CDP Storage.getCookies)', 'accept: application/json', 'x-csrf-bypass: yes'],
      modifiesData: false,
    },
  ],
  inPageEditorInteractions: [
    {
      mechanism: 'window._fullscreen_?.isReady?.() & _store.getState().mirror.sceneGraphSelection',
      purpose: 'Checks when the Figma canvas has finished loading and confirms target node selection before firing keyboard shortcuts.',
      modifiesData: false,
    },
    {
      mechanism: 'Quick Actions (Ctrl+/ or Cmd+/) -> button[data-testid="save-as"] ("Save local copy")',
      purpose: 'Triggers official local .fig file download into the local cache directory for offline Kiwi binary decoding.',
      modifiesData: false,
    },
    {
      mechanism: 'In-page navigator.clipboard.write hook + Ctrl+Shift+C ("Copy as PNG")',
      purpose: 'Captures genuine node PNG screenshots in-page without touching the OS clipboard.',
      modifiesData: false,
    },
  ],
  securityCompliance: {
    usesPersonalAccessTokens: false,
    usesPublicRestApi: false,
    requiresFigmaPlugin: false,
    bypassesPermissionsOrMfa: false,
    readOnlyAccess: true,
  },
});

export function parseGetTreeOutput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { header: {}, outline: '', nodes: [], pages: [], frames: [], components: [], truncated: false };
  }
  const lines = text.split(/\r?\n/);
  let header = {};
  let startIdx = 0;
  if (lines[0]?.startsWith('# ')) {
    try {
      header = JSON.parse(lines[0].slice(2).trim());
    } catch {
      header = {};
    }
    startIdx = 1;
  }

  const nodes = [];
  let currentPage = null;
  let truncated = false;
  const lineRe = /^(\s*)-\s+(\d+:\d+)\s+([A-Z_]+)\s+"((?:[^"\\]|\\.)*)"(?:\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?))?(.*)$/;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('... truncated') || line.includes('not shown:')) {
      truncated = true;
      continue;
    }
    const match = line.match(lineRe);
    if (!match) continue;
    const [, indent, id, type, rawName, wStr, hStr, rest] = match;
    const level = Math.floor((indent || '').length / 2);
    const name = rawName.replace(/\\"/g, '"');
    if (type === 'PAGE') {
      currentPage = name;
    }
    nodes.push({
      id,
      type,
      name,
      level,
      pageName: currentPage || '',
      width: wStr ? Number(wStr) : null,
      height: hStr ? Number(hStr) : null,
      hints: (rest || '').trim(),
    });
  }

  return {
    header,
    outline: lines.slice(startIdx).join('\n'),
    nodes,
    pages: nodes.filter(n => n.type === 'PAGE'),
    frames: nodes.filter(n => ['FRAME', 'GROUP', 'SECTION'].includes(n.type)),
    components: nodes.filter(n => ['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(n.type)),
    truncated,
  };
}

export function parseScreenshotOutput(rawText) {
  const text = String(rawText || '').trim();
  const savedMatch = text.match(/(?:saved to|image written to)\s+([^\r\n;]+)/i);
  const dimMatch = text.match(/(\d+)x(\d+)/);
  return {
    raw: text,
    savedPath: savedMatch ? savedMatch[1].trim() : null,
    width: dimMatch ? Number(dimMatch[1]) : null,
    height: dimMatch ? Number(dimMatch[2]) : null,
  };
}

export function classifyCliFailure(stderr, stdout, exitCode, timedOut = false) {
  const combined = `${stderr || ''}\n${stdout || ''}`;
  if (timedOut) {
    return {
      reason: 'timeout',
      message: 'انتهت مهلة تنفيذ أمر figma-reader قبل اكتمال جلب البيانات.',
      recovery: 'تأكد من استقرار الاتصال بالشبكة وتسجيل الدخول في نافذة المتصفح، ثم أعد المحاولة.',
    };
  }
  if (/Not logged into figma\.com|login window|401|403/i.test(combined)) {
    return {
      reason: 'auth_required',
      message: 'جلسة متصفح figma-reader غير مسجلة الدخول إلى Figma.',
      recovery: 'اضغط على «تسجيل الدخول عبر figma-reader» وأكمل الدخول في نافذة المتصفح المفتوحة لمرة واحدة.',
    };
  }
  if (/restricts? copying|download never started|export_disabled/i.test(combined)) {
    return {
      reason: 'export_disabled',
      message: 'ملف التصميم يمنع النسخ المحلي أو التصدير (Save local copy مقيد من مالك الملف).',
      recovery: 'اطلب صلاحية النسخ أو التصدير للملف في Figma. النظام لا يتجاوز قيود الصلاحيات.',
    };
  }
  if (/node .* not found|did not select node/i.test(combined)) {
    return {
      reason: 'node_not_found',
      message: 'معرّف العقدة المحدد غير موجود داخل ملف التصميم.',
      recovery: 'تحقق من node-id في رابط Figma أو اختر عقدة من مستكشف التصميم.',
    };
  }
  if (exitCode === 2 || /no Figma account chosen/i.test(combined)) {
    return {
      reason: 'usage_or_account_error',
      message: 'خطأ في معاملات استدعاء figma-reader أو إعداد الحساب المحلي.',
      recovery: 'تأكد من وجود ملف .figma-reader.json أو تمرير اسم الحساب الصحيح.',
    };
  }
  return {
    reason: 'cli_error',
    message: combined.trim().slice(0, 400) || `فشل تنفيذ figma-reader (رمز الخروج ${exitCode}).`,
    recovery: 'راجع سجل التدقيق التقني لمعرفة تفاصيل stderr ورمز الخروج.',
  };
}

export class FigmaReaderAdapter {
  constructor({
    cwd = process.cwd(),
    account = 'figma-fidelity-mvp',
    profileDir = path.join(cwd, '.browser-profile-figma-reader'),
    cacheDir = path.join(cwd, 'input', '.figma-reader-cache'),
    filesDirs = [path.join(cwd, 'input', 'downloads')],
    cliPath = path.join(cwd, 'node_modules', '@leogcode', 'figma-reader', 'dist', 'cli.js'),
    defaultTimeoutMs = 90_000,
    execRunner = null,
  } = {}) {
    if (!SAFE_ACCOUNT_RE.test(account)) {
      throw new Error('اسم حساب figma-reader غير صالح.');
    }
    this.cwd = cwd;
    this.account = account;
    this.profileDir = path.resolve(profileDir);
    this.cacheDir = path.resolve(cacheDir);
    this.filesDirs = filesDirs.map(d => path.resolve(d));
    this.cliPath = path.resolve(cliPath);
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.execRunner = execRunner;
    this.auditLogs = [];
  }

  isInstalled() {
    return fs.existsSync(this.cliPath);
  }

  getAuditLogs() {
    return [...this.auditLogs];
  }

  recordLog(entry) {
    this.auditLogs.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.auditLogs.length > 100) {
      this.auditLogs.shift();
    }
  }

  buildEnv(extraEnv = {}) {
    fs.mkdirSync(this.profileDir, { recursive: true });
    fs.mkdirSync(this.cacheDir, { recursive: true });
    for (const dir of this.filesDirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return {
      ...process.env,
      FIGMA_ACCOUNT: this.account,
      FIGMA_USER_DATA_DIR: this.profileDir,
      FIGMA_READER_CACHE: this.cacheDir,
      FIGMA_FILES_DIRS: this.filesDirs.join(path.delimiter),
      ...extraEnv,
    };
  }

  /**
   * Executes figma-reader CLI using execFile and strict argument arrays (never shell interpolation).
   */
  async runCli(command, args = [], { timeoutMs = this.defaultTimeoutMs, envOverrides = {} } = {}) {
    if (!this.isInstalled()) {
      const err = new Error('حزمة @leogcode/figma-reader غير مثبتة في node_modules.');
      err.reason = 'not_installed';
      throw err;
    }
    const safeArgs = [this.cliPath, '--account', this.account, command, ...args.map(String)];
    const startedAt = Date.now();

    if (this.execRunner) {
      const result = await this.execRunner(command, args, { timeoutMs, envOverrides });
      this.recordLog({
        command,
        args,
        exitCode: result.exitCode ?? 0,
        durationMs: Date.now() - startedAt,
        stderr: (result.stderr || '').slice(0, 300),
      });
      return result;
    }

    return new Promise(resolve => {
      execFile(
        process.execPath,
        safeArgs,
        {
          cwd: this.cwd,
          timeout: timeoutMs,
          maxBuffer: 15 * 1024 * 1024,
          windowsHide: command !== 'login',
          env: this.buildEnv(envOverrides),
        },
        (error, stdout = '', stderr = '') => {
          const durationMs = Date.now() - startedAt;
          const timedOut = Boolean(error?.killed || error?.signal === 'SIGTERM');
          const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          const failure = exitCode !== 0 ? classifyCliFailure(stderr, stdout, exitCode, timedOut) : null;

          this.recordLog({
            command,
            args,
            exitCode,
            timedOut,
            durationMs,
            stderr: String(stderr || '').trim().slice(0, 400),
            reason: failure?.reason || 'ok',
          });

          resolve({
            ok: exitCode === 0,
            exitCode,
            timedOut,
            durationMs,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            failure,
          });
        }
      );
    });
  }

  async getVersion() {
    const res = await this.runCli('--version', [], { timeoutMs: 10_000 });
    return res.ok ? res.stdout.trim() : null;
  }

  resolveSafeBrowserUrl(url = null, mode = 'login') {
    if (mode === 'account' || mode === 'files') {
      return 'https://www.figma.com/files';
    }
    if (!url || mode === 'login') {
      if (!url) return 'https://www.figma.com/login';
    }
    const trimmed = String(url || '').trim();
    if (/^https?:\/\/(www\.)?figma\.com\/(login|files)(\/.*|\?.*)?$/i.test(trimmed)) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }
    try {
      const parsed = parseFigmaUrl(trimmed);
      if (parsed.isLocalDevUrl) {
        return parsed.url;
      }
      return parsed.url || 'https://www.figma.com/login';
    } catch {
      return mode === 'account' ? 'https://www.figma.com/files' : 'https://www.figma.com/login';
    }
  }

  /**
   * Opens a visible Chromium/Chrome/Edge/Brave browser window using the dedicated persistent
   * figma-reader profile so the user can log into their Figma account or open their design directly.
   * Uses Windows `cmd.exe /c start ""` on win32 so the window opens immediately (<100ms) in the foreground.
   */
  async openBrowserWindow({ url = null, mode = 'login' } = {}) {
    const startedAt = Date.now();
    const targetUrl = this.resolveSafeBrowserUrl(url, mode);
    try {
      if (!this.cachedExecutablePath) {
        const { defaultExecutable } = await import('@leogcode/figma-reader/dist/browser.js');
        this.cachedExecutablePath = process.env.FIGMA_BROWSER_PATH || defaultExecutable();
      }
      const executablePath = this.cachedExecutablePath;
      fs.mkdirSync(this.profileDir, { recursive: true });
      try {
        fs.rmSync(path.join(this.profileDir, 'DevToolsActivePort'), { force: true });
      } catch {
        // Ignore if not present
      }

      const browserArgs = [
        `--user-data-dir=${this.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        targetUrl,
      ];

      let pid = null;
      if (process.platform === 'win32') {
        const child = spawn('cmd.exe', ['/c', 'start', '', executablePath, ...browserArgs], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        pid = child.pid;
      } else {
        const child = spawn(executablePath, browserArgs, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        pid = child.pid;
      }

      this.lastBrowserLaunchAt = Date.now();
      this.recordLog({
        command: 'open-browser',
        args: [mode, targetUrl],
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        reason: 'ok',
      });

      return {
        ok: true,
        loggedIn: false,
        loginWindowOpened: true,
        loginWindowOpen: true,
        pid,
        mode,
        targetUrl,
        executable: executablePath,
        profile: this.profileDir,
        account: { name: this.account },
        message:
          mode === 'account'
            ? `تم فتح المتصفح فورًا على حساب وملفات Figma (${targetUrl}).`
            : mode === 'design'
              ? `تم فتح رابط التصميم فورًا في المتصفح (${targetUrl}).`
              : `تم فتح المتصفح فورًا لتسجيل الدخول إلى حساب Figma (${targetUrl}).`,
      };
    } catch (err) {
      this.recordLog({
        command: 'open-browser',
        args: [mode, targetUrl],
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stderr: err.message,
        reason: 'browser_launch_failed',
      });
      return {
        ok: false,
        loginWindowOpened: false,
        targetUrl,
        message: `تعذر فتح المتصفح المخصص: ${err.message}`,
        recovery: 'تأكد من وجود متصفح Chrome أو Edge أو Brave مثبت على نظام Windows.',
      };
    }
  }

  async getStatus() {
    if (!this.isInstalled()) {
      return {
        installed: false,
        state: 'disconnected',
        loggedIn: false,
        message: 'حزمة @leogcode/figma-reader غير مثبتة.',
      };
    }
    if (!this.execRunner) {
      try {
        const browserModPath = path.resolve(
          this.cwd,
          'node_modules',
          '@leogcode',
          'figma-reader',
          'dist',
          'browser.js'
        );
        const { defaultExecutable, profileHasLoginCookie, profileReachedFigmaFiles } = await import(
          pathToFileURL(browserModPath).href
        );
        if (!this.cachedExecutablePath) {
          this.cachedExecutablePath = process.env.FIGMA_BROWSER_PATH || defaultExecutable();
        }
        const scratchPath = path.join(this.stateDir, `history-check-${process.pid}.sqlite`);
        const cookieSeen = Boolean(
          profileHasLoginCookie(this.profileDir) ||
            profileReachedFigmaFiles(this.profileDir, 0, scratchPath)
        );
        const loginWindowOpen = Boolean(
          this.lastBrowserLaunchAt && Date.now() - this.lastBrowserLaunchAt < 10 * 60 * 1000
        );
        return {
          installed: true,
          tool: '@leogcode/figma-reader',
          version: '0.4.2',
          state: cookieSeen ? 'connected' : loginWindowOpen ? 'awaiting_login' : 'requires_login',
          loggedIn: cookieSeen,
          loginCookieSeen: cookieSeen,
          loginWindowOpen,
          account: { name: this.account, source: 'FIGMA_ACCOUNT' },
          user: null,
          mode: 'managed',
          executable: this.cachedExecutablePath || null,
          profile: this.profileDir,
          cacheDir: this.cacheDir,
          httpDevModeAllowed: process.env.NODE_ENV !== 'production',
          message: cookieSeen
            ? `متصل عبر figma-reader (${this.account}).`
            : loginWindowOpen
              ? 'نافذة المتصفح المخصص مفتوحة حاليًا. يمكنك تسجيل الدخول أو استعراض حسابك ثم الضغط على «مزامنة من Figma».'
              : 'حزمة figma-reader جاهزة. يلزم تسجيل الدخول لمرة واحدة في المتصفح المخصص لسحب التصاميم السحابية.',
          recovery: cookieSeen
            ? ''
            : 'اضغط «فتح المتصفح وتسجيل الدخول» أو «فتح حساب Figma» لفتح نافذة المتصفح المستقلة وتسجيل الدخول.',
          internalApiDisclosure: FIGMA_READER_INTERNAL_API_AUDIT,
        };
      } catch {
        // Fallback to CLI status below
      }
    }
    const res = await this.runCli('status', [], { timeoutMs: 15_000 });
    if (!res.ok) {
      return {
        installed: true,
        state: 'error',
        loggedIn: false,
        exitCode: res.exitCode,
        stderr: res.stderr,
        message: res.failure?.message || 'تعذر قراءة حالة figma-reader.',
        recovery: res.failure?.recovery || '',
      };
    }
    let parsed = {};
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      parsed = { raw: res.stdout };
    }

    const loggedIn = parsed.loggedIn === true || Boolean(parsed.loginCookieSeen);
    return {
      installed: true,
      tool: '@leogcode/figma-reader',
      version: '0.4.2',
      state: loggedIn ? 'connected' : parsed.loginWindowOpen ? 'awaiting_login' : 'requires_login',
      loggedIn,
      loginCookieSeen: Boolean(parsed.loginCookieSeen),
      loginWindowOpen: Boolean(parsed.loginWindowOpen),
      account: parsed.account || { name: this.account, source: 'FIGMA_ACCOUNT' },
      user: parsed.user || null,
      mode: parsed.mode || 'managed',
      executable: parsed.executable || null,
      profile: parsed.profile || this.profileDir,
      cacheDir: parsed.cacheDir || this.cacheDir,
      httpDevModeAllowed: process.env.NODE_ENV !== 'production',
      message: loggedIn
        ? `متصل عبر figma-reader (${parsed.user?.email || parsed.account?.name || this.account}).`
        : parsed.loginWindowOpen
          ? 'نافذة المتصفح المخصص مفتوحة حاليًا. يمكنك تسجيل الدخول أو استعراض حسابك ثم الضغط على «مزامنة من Figma».'
          : 'حزمة figma-reader جاهزة. يلزم تسجيل الدخول لمرة واحدة في المتصفح المخصص لسحب التصاميم السحابية.',
      recovery: loggedIn
        ? ''
        : 'اضغط «فتح المتصفح وتسجيل الدخول» أو «فتح حساب Figma» لفتح نافذة المتصفح المستقلة وتسجيل الدخول.',
      internalApiDisclosure: FIGMA_READER_INTERNAL_API_AUDIT,
    };
  }

  async login({ waitSeconds = 0, url = null, mode = 'login' } = {}) {
    if (!this.execRunner && (!waitSeconds || waitSeconds <= 0)) {
      return this.openBrowserWindow({ url, mode });
    }
    const args = [];
    if (typeof waitSeconds === 'number' && waitSeconds > 0) {
      args.push('--wait-seconds', String(Math.min(300, Math.floor(waitSeconds))));
    }
    const res = await this.runCli('login', args, {
      timeoutMs: (Math.max(15, waitSeconds) + 15) * 1000,
    });
    if (!res.ok) {
      return {
        ok: false,
        exitCode: res.exitCode,
        stderr: res.stderr,
        message: res.failure?.message || 'تعذر فتح نافذة تسجيل الدخول.',
        recovery: res.failure?.recovery || '',
      };
    }
    const out = res.stdout.trim();
    if (out.startsWith('{')) {
      try {
        const data = JSON.parse(out);
        return {
          ok: true,
          loggedIn: Boolean(data.loggedIn),
          user: data.user || null,
          account: data.account || { name: this.account },
          message: data.loggedIn
            ? `تم التحقق من تسجيل الدخول بنجاح (${data.user?.email || data.user?.handle || this.account}).`
            : out,
        };
      } catch {
        // Fall through to text handling
      }
    }
    return {
      ok: true,
      loggedIn: false,
      loginWindowOpened: /Login window opened|login window/i.test(out),
      message: 'فُتحت نافذة تسجيل الدخول لـ figma-reader. أكمل تسجيل الدخول في المتصفح ثم اضغط مزامنة من Figma.',
      rawOutput: out,
    };
  }

  validateTarget(target, { requireNodeId = false } = {}) {
    if (!target || typeof target !== 'string') {
      throw new Error('يرجى تحديد رابط Figma أو مسار ملف .fig صالح.');
    }
    const trimmed = target.trim();
    if (/\.fig$/i.test(trimmed)) {
      const resolved = path.resolve(this.cwd, trimmed);
      const rel = path.relative(this.cwd, resolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('مسار ملف .fig خارج مجلد المشروع المسموح.');
      }
      if (!fs.existsSync(resolved)) {
        throw new Error(`ملف .fig المحلي غير موجود: ${rel}`);
      }
      return { kind: 'local-fig', target: resolved, fileKey: null, nodeId: null, fileName: path.basename(resolved) };
    }
    const parsed = requireNodeId ? assertSyncableDesignUrl(trimmed) : parseFigmaUrl(trimmed);
    if (parsed.isLocalDevUrl && parsed.localFigPath) {
      const resolved = path.resolve(this.cwd, parsed.localFigPath);
      if (fs.existsSync(resolved)) {
        return {
          kind: 'local-fig',
          target: resolved,
          fileKey: parsed.fileKey || 'local-dev-http',
          nodeId: parsed.nodeId || '942:2734',
          fileName: parsed.fileName || 'Local Dev HTTP Design',
          isLocalDevUrl: true,
        };
      }
    }
    return {
      kind: 'url',
      target: parsed.url,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      fileName: parsed.fileName,
      isHttpDev: Boolean(parsed.isHttpDev),
    };
  }

  async loadFile(target, { refresh = false, timeoutMs = this.defaultTimeoutMs } = {}) {
    const validated = this.validateTarget(target);
    const args = [validated.target];
    if (refresh) args.push('--refresh');
    const res = await this.runCli('load-file', args, { timeoutMs });
    if (!res.ok) {
      const err = new Error(res.failure?.message || 'فشل تحميل ملف التصميم عبر figma-reader.');
      err.reason = res.failure?.reason || 'cli_error';
      err.recovery = res.failure?.recovery || '';
      err.exitCode = res.exitCode;
      err.stderr = res.stderr;
      throw err;
    }
    let data;
    try {
      data = JSON.parse(res.stdout);
    } catch {
      throw new Error('استجابة load-file من figma-reader ليست JSON صالحًا.');
    }
    if (!data || !Array.isArray(data.pages)) {
      throw new Error('لم يُرجع figma-reader بيانات صفحات التصميم.');
    }
    return {
      ...data,
      fileKey: data.key || validated.fileKey || null,
      durationMs: res.durationMs,
    };
  }

  async getTree(target, { nodeId = null, depth = 2, maxNodes = 400, refresh = false, timeoutMs = this.defaultTimeoutMs } = {}) {
    const validated = this.validateTarget(target);
    const args = [validated.target, '--depth', String(depth), '--max-nodes', String(maxNodes)];
    const effectiveNodeId = nodeId || (validated.kind === 'local-fig' ? null : null);
    if (effectiveNodeId) {
      if (!SAFE_NODE_ID_RE.test(effectiveNodeId)) throw new Error('معرّف العقدة غير صالح.');
      args.push('--node-id', effectiveNodeId.replace(/-/g, ':'));
    }
    if (refresh) args.push('--refresh');
    const res = await this.runCli('get-tree', args, { timeoutMs });
    if (!res.ok) {
      const err = new Error(res.failure?.message || 'فشل استخراج شجرة التصميم عبر figma-reader.');
      err.reason = res.failure?.reason || 'cli_error';
      err.recovery = res.failure?.recovery || '';
      err.exitCode = res.exitCode;
      err.stderr = res.stderr;
      throw err;
    }
    return parseGetTreeOutput(res.stdout);
  }

  async getNode(target, { nodeId = null, depth = 3, refresh = false, fileKey = null, fileName = null, timeoutMs = this.defaultTimeoutMs } = {}) {
    const validated = this.validateTarget(target);
    const wantedId = (nodeId || validated.nodeId || '').replace(/-/g, ':');
    if (!wantedId || !SAFE_NODE_ID_RE.test(wantedId)) {
      throw new Error('يلزم تحديد معرّف عقدة صالح (node-id) لاستخراج خصائصها.');
    }
    const args = [validated.target, '--node-id', wantedId, '--depth', String(depth)];
    if (refresh) args.push('--refresh');
    const res = await this.runCli('get-node', args, { timeoutMs });
    if (!res.ok) {
      const err = new Error(res.failure?.message || 'فشل استخراج خصائص العقدة عبر figma-reader.');
      err.reason = res.failure?.reason || 'cli_error';
      err.recovery = res.failure?.recovery || '';
      err.exitCode = res.exitCode;
      err.stderr = res.stderr;
      throw err;
    }
    let rawNode;
    try {
      rawNode = JSON.parse(res.stdout);
    } catch {
      throw new Error('استجابة get-node من figma-reader ليست JSON صالحًا.');
    }
    if (!rawNode || !rawNode.id) {
      throw new Error('لم يُرجع figma-reader عقدة تصميم صالحة.');
    }
    const canonical = normalizeFigmaReaderNode(rawNode, {
      fileKey: fileKey || validated.fileKey || null,
      fileName: fileName || validated.fileName || rawNode.page || 'Figma Design',
    });
    return {
      rawNode,
      canonical,
      durationMs: res.durationMs,
    };
  }

  async captureScreenshot(target, { nodeId = null, savePath = null, maxDimension = 1568, timeoutMs = 60_000 } = {}) {
    const validated = this.validateTarget(target);
    const wantedId = (nodeId || validated.nodeId || '').replace(/-/g, ':');
    if (!wantedId || !SAFE_NODE_ID_RE.test(wantedId)) {
      throw new Error('يلزم تحديد معرّف عقدة صالح لالتقاط صورة PNG مرجعية.');
    }
    const dest = savePath
      ? path.resolve(this.cwd, savePath)
      : path.join(this.cwd, 'input', 'downloads', `figma-reader-${wantedId.replace(':', '-')}.png`);
    const rel = path.relative(this.cwd, dest);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('مسار حفظ اللقطة المرجعية خارج مجلد المشروع.');
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const args = [
      validated.target,
      '--node-id',
      wantedId,
      '--save-path',
      dest,
      '--max-dimension',
      String(maxDimension),
    ];
    const res = await this.runCli('screenshot', args, { timeoutMs });
    if (!res.ok) {
      return {
        ok: false,
        reason: res.failure?.reason || 'screenshot_unavailable',
        message: res.failure?.message || 'تعذر التقاط صورة PNG من المتصفح.',
        recovery: res.failure?.recovery || '',
      };
    }
    const parsed = parseScreenshotOutput(res.stdout);
    const actualFile = parsed.savedPath && fs.existsSync(parsed.savedPath) ? parsed.savedPath : dest;
    if (!fs.existsSync(actualFile)) {
      return {
        ok: false,
        reason: 'screenshot_missing',
        message: 'انتهى أمر اللقطة دون كتابة ملف PNG على القرص.',
      };
    }
    const bytes = fs.readFileSync(actualFile);
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
      return {
        ok: false,
        reason: 'invalid_png',
        message: 'الملف الملتقط ليس صورة PNG صالحة.',
      };
    }
    return {
      ok: true,
      path: actualFile,
      relativePath: path.relative(this.cwd, actualFile).split(path.sep).join('/'),
      width: parsed.width,
      height: parsed.height,
      byteLength: bytes.length,
      bytes,
      source: 'figma-reader-screenshot',
    };
  }

  /**
   * Full synchronization pipeline via figma-reader:
   * 1. Load file summary (pages, nodeCounts, exportedAt/fileModifiedAt)
   * 2. Extract tree outline (pages, frames, components)
   * 3. Extract & normalize target node into Canonical Design Schema
   * 4. Optionally capture node screenshot when source is live web
   */
  async syncDesign(target, { nodeId = null, refresh = false, captureImage = false, timeoutMs = this.defaultTimeoutMs } = {}) {
    const validated = this.validateTarget(target);
    const summary = await this.loadFile(validated.target, { refresh, timeoutMs });
    // Subsequent calls in the same sync use the freshly exported/loaded snapshot without re-exporting
    const tree = await this.getTree(validated.target, { depth: 2, maxNodes: 400, refresh: false, timeoutMs });

    const rawCandidateId = (nodeId || validated.nodeId || '').replace(/-/g, ':');
    const matchedInTree = rawCandidateId
      ? tree.nodes.find(n => n.id === rawCandidateId && n.type !== 'PAGE')
      : null;

    const candidateNodeId =
      matchedInTree?.id ||
      tree.frames[0]?.id ||
      tree.components[0]?.id ||
      tree.nodes.find(n => n.type !== 'PAGE')?.id ||
      rawCandidateId ||
      null;

    if (!candidateNodeId) {
      throw new Error('لم يُعثر على عقدة قابلة للفحص داخل ملف التصميم.');
    }

    const { rawNode, canonical } = await this.getNode(validated.target, {
      nodeId: candidateNodeId,
      depth: 3,
      refresh: false,
      fileKey: summary.fileKey || validated.fileKey,
      fileName: summary.name || validated.fileName,
      timeoutMs,
    });

    let screenshot = null;
    if (captureImage && summary.source === 'web') {
      screenshot = await this.captureScreenshot(validated.target, {
        nodeId: candidateNodeId,
        timeoutMs: 45_000,
      }).catch(() => null);
    }

    return {
      ok: true,
      adapter: 'figma-reader',
      source: summary.source === 'web' ? 'figma-reader-web' : 'figma-reader-local',
      fileKey: summary.fileKey || validated.fileKey || null,
      fileName: summary.name || validated.fileName || 'Figma Design',
      exportedAt: summary.exportedAt || null,
      fileModifiedAt: summary.fileModifiedAt || null,
      account: summary.account || null,
      summary,
      hierarchy: {
        pages: tree.pages,
        frames: tree.frames,
        components: tree.components,
        allNodes: tree.nodes,
        outline: tree.outline,
        truncated: tree.truncated,
      },
      selectedNodeId: canonical.nodeId,
      rawNode,
      ref: canonical,
      index: tree.nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        pageName: n.pageName || '',
        width: n.width,
        height: n.height,
      })),
      screenshot: screenshot?.ok ? screenshot : null,
    };
  }
}

