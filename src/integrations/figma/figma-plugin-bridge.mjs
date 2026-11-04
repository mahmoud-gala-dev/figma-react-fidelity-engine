import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const STALE_MS = 8000;
const JOB_WAIT_MS = 90_000;

export function newPairingSecret() {
  return randomBytes(24).toString('base64url');
}

export function safeTokenEqual(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !given || !expected) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createBridge({ secret, now = () => Date.now() } = {}) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('pairing secret is missing');
  let plugin = null;
  const jobs = new Map();
  let lastSync = null;

  function rememberPlugin(fields, at) {
    plugin = { ...plugin, ...fields, lastSeen: at };
  }

  function status(at = now()) {
    const fresh = Boolean(plugin && at - plugin.lastSeen < STALE_MS);
    const pending = [...jobs.values()].find(job => job.state === 'pending');
    const latest = [...jobs.values()].at(-1) || null;
    let state = 'connector_requires_setup';
    let message = 'الموصّل يحتاج إعدادًا. ثبّت إضافة Figma Fidelity Connector داخل Figma Desktop ثم الصق رمز الاقتران.';
    let recovery = 'من تطبيق Figma: Plugins → Development → Import plugin from manifest، واختر ملف manifest.json الذي بجانب code.js، ثم شغّل الإضافة.';
    if (pending) {
      state = 'synchronizing';
      message = fresh ? 'جارٍ طلب البيانات من الإضافة على الملف المفتوح.' : 'طلب المزامنة قائم، لكن الإضافة غير متصلة الآن.';
      recovery = 'أبقِ Figma Desktop مفتوحًا على نفس الملف، وشغّل الإضافة، ثم انتظر اكتمال الطلب.';
    } else if (latest?.state === 'failed' && (!lastSync || latest.at >= lastSync.at)) {
      state = latest.reason === 'permission_denied' ? 'permission_denied' : latest.reason === 'unsupported_document' ? 'unsupported_document' : 'sync_failed';
      message = latest.message;
      recovery = latest.recovery || 'صحح السبب الظاهر ثم اضغط مزامنة من Figma مرة أخرى.';
    } else if (plugin && !fresh) {
      state = 'disconnected';
      message = 'غير متصل. Figma Desktop مغلق أو الإضافة متوقفة.';
      recovery = 'افتح التصميم في Figma Desktop وشغّل إضافة Figma Fidelity Connector. الرابط لا يفتح الملف بنفسه.';
    } else if (fresh && plugin.editorType && plugin.editorType !== 'figma') {
      state = 'unsupported_document';
      message = 'المستند المفتوح ليس ملف Figma Design.';
      recovery = 'هذه الإضافة تعمل مع ملفات Design فقط، وليس FigJam أو Slides.';
    } else if (fresh && lastSync && plugin.fileKey === lastSync.fileKey && plugin.revision && lastSync.pluginRevision && plugin.revision !== lastSync.pluginRevision) {
      state = 'design_changed';
      message = 'تغيّر التصميم في Figma بعد آخر مزامنة.';
      recovery = 'اضغط تحديث التصميم لسحب القيم الحالية للعقدة المحددة.';
    } else if (fresh && lastSync) {
      state = 'synchronized';
      message = 'تمت مزامنة سابقة والإضافة ما زالت متصلة.';
      recovery = '';
    } else if (fresh) {
      state = 'connected';
      message = plugin.fileName ? `متصل. الملف المفتوح: ${plugin.fileName}.` : 'متصل. الإضافة ترسل نبضًا من Figma Desktop.';
      recovery = 'الصق رابط التصميم الذي يطابق الملف المفتوح، ثم اضغط مزامنة من Figma.';
    }
    return {
      state, message, recovery,
      openFileKey: fresh ? plugin.fileKey : null,
      openFileName: fresh ? plugin.fileName : null,
      editorType: fresh ? plugin.editorType : null,
      revision: fresh ? plugin.revision : null,
      paired: Boolean(plugin),
      lastSyncAt: lastSync?.at || null,
      lastSyncNodeId: lastSync?.nodeId || null,
      previewId: lastSync?.previewId || null,
    };
  }

  function assertToken(token) {
    if (!safeTokenEqual(token, secret)) throw httpError(401, 'رمز الاقتران مرفوض. انسخ الرمز الحالي من لوحة التحكم على هذا الجهاز.');
  }

  return {
    status,
    hello({ token, editorType, fileKey, fileName, revision }) {
      assertToken(token);
      const sessionId = randomUUID();
      rememberPlugin({
        sessionId,
        editorType: typeof editorType === 'string' ? editorType.slice(0, 40) : 'unknown',
        fileKey: typeof fileKey === 'string' ? fileKey : null,
        fileName: typeof fileName === 'string' ? fileName.slice(0, 200) : '',
        revision: typeof revision === 'string' ? revision.slice(0, 64) : null,
      }, now());
      return { ok: true, sessionId };
    },
    poll({ token, sessionId, revision, fileKey, fileName, editorType }) {
      assertToken(token);
      if (!plugin || plugin.sessionId !== sessionId) throw httpError(401, 'جلسة الإضافة انتهت. أعد لصق رمز الاقتران في الإضافة.');
      rememberPlugin({
        revision: typeof revision === 'string' && revision ? revision.slice(0, 64) : plugin.revision,
        fileKey: fileKey || plugin.fileKey,
        fileName: fileName ? fileName.slice(0, 200) : plugin.fileName,
        editorType: editorType ? editorType.slice(0, 40) : plugin.editorType,
      }, now());
      const job = [...jobs.values()].find(item => item.state === 'pending' && item.fileKey === plugin.fileKey);
      if (!job) return { job: null };
      return { job: { id: job.id, fileKey: job.fileKey, nodeId: job.nodeId, mode: job.mode } };
    },
    createJob({ fileKey, nodeId, fileName, mode }) {
      const at = now();
      for (const job of jobs.values()) {
        if (job.state === 'pending') {
          job.state = 'failed';
          job.reason = 'superseded';
          job.message = 'استُبدل الطلب بطلب مزامنة أحدث.';
          job.at = at;
        }
      }
      const fresh = Boolean(plugin && at - plugin.lastSeen < STALE_MS);
      const job = { id: randomUUID(), fileKey, nodeId, fileName: fileName || '', mode: mode === 'refresh' ? 'refresh' : 'sync', state: 'pending', at, result: null, message: '', reason: null, recovery: '' };
      if (fresh && plugin.editorType && plugin.editorType !== 'figma') {
        job.state = 'failed';
        job.reason = 'unsupported_document';
        job.message = 'نوع المستند المفتوح غير مدعوم. الإضافة متصلة بملف ليس Figma Design.';
        job.recovery = 'افتح ملف Design الموافق للرابط. روابط FigJam وSlides خارج نطاق الموصّل.';
      } else if (fresh && plugin.fileKey && plugin.fileKey !== fileKey) {
        job.state = 'failed';
        job.reason = 'permission_denied';
        job.message = `الملف المفتوح في Figma لا يطابق الرابط. المفتوح: ${plugin.fileKey}. المطلوب: ${fileKey}.`;
        job.recovery = 'افتح التصميم نفسه في Figma Desktop. لا يستطيع هذا المشروع فتح ملف سحابي من الرابط وحده.';
      } else if (fresh && !plugin.fileKey) {
        job.state = 'failed';
        job.reason = 'sync_failed';
        job.message = 'الملف المفتوح بلا مفتاح ملف. احفظه داخل حساب Figma ثم أعد المزامنة.';
        job.recovery = 'الملفات غير المحفوظة لا تُطابق رابط figma.com.';
      }
      jobs.set(job.id, job);
      while (jobs.size > 20) jobs.delete(jobs.keys().next().value);
      return job;
    },
    completeJob({ token, sessionId, jobId, payload }) {
      assertToken(token);
      const job = jobs.get(jobId);
      if (!job || job.state !== 'pending') throw httpError(404, 'لا يوجد طلب مزامنة قائم.');
      if (!plugin || plugin.sessionId !== sessionId) throw httpError(401, 'جلسة الإضافة غير مطابقة للطلب.');
      if (!payload || payload.fileKey !== job.fileKey) throw httpError(400, 'بيانات الملف لا تطابق طلب المزامنة.');
      job.state = 'done';
      job.result = payload;
      job.at = now();
      return job;
    },
    failJob({ token, sessionId, jobId, reason, message }) {
      assertToken(token);
      const job = jobs.get(jobId);
      if (!job) throw httpError(404, 'طلب المزامنة غير موجود.');
      if (!plugin || plugin.sessionId !== sessionId) throw httpError(401, 'جلسة الإضافة غير مطابقة.');
      const allowed = new Set(['permission_denied', 'unsupported_document', 'missing_node', 'sync_failed']);
      job.state = 'failed';
      job.reason = allowed.has(reason) ? reason : 'sync_failed';
      job.message = typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : 'فشلت المزامنة داخل الإضافة.';
      job.recovery = 'اقرأ رسالة الإضافة، وافتح العقدة المطلوبة في الملف المصرّح به، ثم أعد المزامنة.';
      job.at = now();
      return job;
    },
    getJob(id) { return jobs.get(id) || null; },
    rememberSync(record) { lastSync = record; },
    expireStale(at = now()) {
      for (const job of jobs.values()) {
        if (job.state === 'pending' && at - job.at > JOB_WAIT_MS) {
          job.state = 'failed';
          job.reason = 'sync_failed';
          job.message = 'انتهت مهلة المزامنة لأن الإضافة لم تستلم الطلب.';
          job.recovery = 'شغّل الإضافة واتركها مفتوحة، ثم اضغط مزامنة من Figma مرة أخرى.';
          job.at = at;
        }
      }
    },
  };
}
