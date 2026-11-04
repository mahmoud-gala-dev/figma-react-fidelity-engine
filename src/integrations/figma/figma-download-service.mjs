import fs from 'node:fs';
import path from 'node:path';
import { assertNodeId } from './figma-sync-service.mjs';
import { assertSyncableDesignUrl } from './figma-url-parser.mjs';
import { diffRevisions, fingerprintReference } from './figma-version-tracker.mjs';
import { canonicalDesignUrl } from './figma-browser-downloader.mjs';
import { savePrivatePng } from './figma-asset-manager.mjs';

function contained(root, target) {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function idleJob() {
  return {
    id: null,
    state: 'idle',
    reason: '',
    message: 'الصق رابط تصميم Figma ثم اضغط تنزيل التصميم. أول مرة تُفتح نافذة لتسجيل الدخول.',
    recovery: 'بعد أول دخول ناجح تُعاد الجلسة من ملف التعريف المحلي دون إضافة Figma.',
    result: null,
  };
}

function publicJob(job) {
  return {
    id: job?.id || null,
    state: job?.state || 'idle',
    reason: job?.reason || '',
    message: job?.message || '',
    recovery: job?.recovery || '',
    fileKey: job?.fileKey || null,
    nodeId: job?.nodeId || null,
    result: job?.result || null,
  };
}

function recoveryFor(reason) {
  const map = {
    login_timeout: 'أعد تنزيل التصميم وسجّل الدخول في النافذة قبل انتهاء المهلة.',
    editor_timeout: 'تأكد أن الحساب يفتح هذا الملف ثم أعد المحاولة.',
    ui_changed: 'الأمر المعتمد هو Main menu ثم File ثم Save local copy. إن تغيّر الاسم فالتنزيل يتوقف بدل اختراع ملف.',
    export_disabled: 'اطلب من مالك الملف السماح بالنسخ والتصدير. لا يُتجاوز هذا القيد.',
    browser_missing: 'ثبّت Google Chrome أو نفّذ npx playwright install chromium.',
    browser_busy: 'أغلق نافذة Chrome التي تستخدم ملف التعريف ثم أعد المحاولة.',
    invalid_fig: 'لم يُقبل الملف كمرجع. راجع الملف المحفوظ محليًا.',
    node_missing: 'التنزيل حفظ الملف، لكن معرّف الرابط غير موجود داخله.',
    unsupported_document: 'استخدم رابط Figma Design وليس FigJam أو Slides.',
  };
  return map[reason] || 'اقرأ الرسالة ثم أعد تنزيل التصميم. لا يُعرض نجاح بلا ملف .fig.';
}

export function createDownloadJobs({ dataDir, cwd, downloadDesign, now = () => Date.now() } = {}) {
  const storePath = path.join(dataDir, 'last-download.json');
  const fpPath = path.join(dataDir, 'fig-fingerprints.json');
  let job = readJson(storePath);
  let pending = null;

  function persist(next) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(next));
  }

  function remember(fileKey, nodeId, ref) {
    const all = readJson(fpPath) || {};
    const key = `${fileKey}::${nodeId}`;
    const change = diffRevisions(all[key] || null, fingerprintReference(ref));
    all[key] = fingerprintReference(ref);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(fpPath, JSON.stringify(all));
    return change;
  }

  function toResult(outcome, change) {
    let previewUrl = null;
    const thumb = outcome.thumbnail;
    if (thumb && thumb.length > 8 && thumb[0] === 0x89) {
      const id = `fig${now().toString(16)}`.padEnd(16, '0').slice(0, 32);
      try {
        savePrivatePng(dataDir, id, Buffer.from(thumb));
        previewUrl = `/api/figma-connector/assets/${id}`;
      } catch { previewUrl = null; }
    }
    return {
      ref: outcome.ref,
      index: outcome.index || [],
      change,
      relativePath: outcome.relativePath,
      byteLength: outcome.byteLength,
      browser: outcome.browser,
      header: outcome.header || null,
      parsedCount: outcome.parsedCount || null,
      previewUrl,
      previewKind: previewUrl ? 'fig-file-thumbnail' : null,
      previewNote: 'الصورة المصغرة داخل ملف .fig ليست لقطة للعقدة، لذلك التشابه البصري الأصيل يبقى غير متاح.',
      acquiredBy: 'playwright-save-local-copy',
      sourceType: 'openfig-native-file',
    };
  }

  function finish(parsed, outcome) {
    const change = remember(parsed.fileKey, outcome.ref?.nodeId || parsed.nodeId, outcome.ref);
    const state = change.changed ? 'design_changed' : 'downloaded';
    job = {
      ...job,
      state,
      reason: '',
      message: `${change.summary} الملف: ${outcome.relativePath}`,
      recovery: '',
      result: toResult(outcome, change),
    };
    persist(job);
  }

  function start(body) {
    if (pending) {
      throw Object.assign(new Error('يوجد تنزيل قيد التنفيذ.'), { status: 409, recovery: 'انتظر إغلاق النافذة الحالية.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw Object.assign(new Error('جسم الطلب غير صالح.'), { status: 400 });
    }
    const extra = Object.keys(body).filter(key => key !== 'url');
    if (extra.length) {
      throw Object.assign(new Error('الطلب يقبل حقل url فقط.'), { status: 400, recovery: 'لا تُرسل مسارات أو ملفات تعريف أو رموز جلسة.' });
    }
    let parsed;
    try { parsed = assertSyncableDesignUrl(body.url); }
    catch (error) {
      error.status = 400;
      throw error;
    }
    const safeUrl = canonicalDesignUrl(parsed);
    job = {
      id: `dl${now().toString(36)}`,
      state: 'launching',
      reason: '',
      message: 'جارٍ فتح متصفح محلي.',
      recovery: '',
      result: null,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
    };
    const runner = downloadDesign || (async (request) => {
      const { createFigmaBrowserDownloader } = await import('./figma-browser-downloader.mjs');
      const downloader = createFigmaBrowserDownloader({
        profileDir: path.join(cwd, 'input', '.browser-profile'),
        downloadDir: path.join(cwd, 'input', '.downloads'),
        projectRoot: cwd,
      });
      return downloader.download(request);
    });
    pending = Promise.resolve()
      .then(() => runner({
        url: safeUrl,
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        fileName: parsed.fileName,
        onProgress: (patch) => {
          job = { ...job, ...patch, id: job.id, fileKey: parsed.fileKey, nodeId: parsed.nodeId };
        },
      }))
      .then(outcome => {
        if (!outcome?.relativePath || !outcome?.ref) {
          throw Object.assign(new Error('المتنزّل لم يُرجع ملفًا مقروءًا.'), { reason: 'download_failed' });
        }
        finish(parsed, outcome);
      })
      .catch(error => {
        job = {
          ...job,
          state: 'failed',
          reason: error.reason || 'download_failed',
          message: error.message,
          recovery: error.recovery || recoveryFor(error.reason),
          result: error.relativePath ? { relativePath: error.relativePath, fileSaved: true, ref: null } : null,
        };
        persist(job);
      })
      .finally(() => { pending = null; });
    return publicJob(job);
  }

  async function select(nodeId) {
    assertNodeId(nodeId);
    const relativePath = job?.result?.relativePath;
    if (!relativePath) {
      throw Object.assign(new Error('لا يوجد ملف .fig محفوظ من تنزيل سابق.'), { status: 404, recovery: 'اضغط تنزيل التصميم أولًا. الاستيراد اليدوي يبقى اختياريًا.' });
    }
    const absolute = path.resolve(cwd, relativePath);
    const root = path.resolve(cwd, 'input', '.downloads');
    if (!contained(root, absolute) || !fs.existsSync(absolute)) {
      throw Object.assign(new Error('ملف التنزيل المحفوظ غير موجود داخل مجلد التنزيلات.'), { status: 404 });
    }
    const { importFigDocument } = await import('./figma-sync-service.mjs');
    const imported = await importFigDocument(fs.readFileSync(absolute), { nodeId, fileName: path.basename(absolute) });
    finish({ fileKey: job.fileKey, nodeId }, { ...imported, relativePath, byteLength: fs.statSync(absolute).size, browser: job.result.browser, thumbnail: null });
    return publicJob(job);
  }

  return {
    start,
    status: () => publicJob(job || idleJob()),
    select,
    settle: () => pending || Promise.resolve(),
  };
}
