import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FigmaReaderAdapter } from '../../src/integrations/figma-reader/figma-reader-adapter.mjs';
import { OpenFigAdapter } from '../../src/integrations/openfig/openfig-adapter.mjs';
import { FigmaExportLegacyAdapter } from '../../src/integrations/figma-export-legacy/figma-export-adapter.mjs';
import { parseFigmaUrl } from '../../src/integrations/figma/figma-url-parser.mjs';
import { diffRevisions, fingerprintReference } from '../../src/integrations/figma/figma-version-tracker.mjs';
import {
  readDesignSnapshot,
  saveDesignSnapshot,
  savePrivatePng,
} from '../../src/design/asset-manager/asset-manager.mjs';
import {
  buildFigmaDesignImageDataUrl,
  resolveUrlDesignNode,
} from '../../src/lib/figma-image-generator.mjs';
import { calculateFidelityAndEvidence } from '../../src/comparison/scoring-engine/scoring-engine.mjs';
import { compareWithGemini } from '../../src/comparison/ai-engine/gemini-comparison.mjs';
import { runPixelmatchComparison, runRegCliReport } from '../../src/comparison/visual-engine/visual-comparison.mjs';
import { generateHtmlReport, generateJsonReport } from '../../src/reports/html/html-report-generator.mjs';
import { SyncJobManager } from '../jobs/sync-job-manager.mjs';

const SAFE_REPORT_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;

export class FigmaSyncOrchestrator {
  constructor({
    cwd = process.cwd(),
    dataDir = path.join(cwd, 'input', '.connector'),
    snapshotDir = path.join(cwd, 'input', '.figma-snapshots'),
    reportsDir = path.join(cwd, 'out', 'reports'),
    readerAdapter = null,
    openFigAdapter = null,
    legacyExportAdapter = null,
    jobManager = null,
  } = {}) {
    this.cwd = cwd;
    this.dataDir = dataDir;
    this.snapshotDir = snapshotDir;
    this.reportsDir = reportsDir;
    this.readerAdapter = readerAdapter || new FigmaReaderAdapter({ cwd });
    this.openFigAdapter = openFigAdapter || new OpenFigAdapter({ cwd });
    this.legacyExportAdapter = legacyExportAdapter || new FigmaExportLegacyAdapter({ cwd });
    this.jobManager = jobManager || new SyncJobManager();

    this.currentSync = null;
    this.previousFingerprint = null;
    this.reports = new Map();

    fs.mkdirSync(this.snapshotDir, { recursive: true });
    fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  async getStatus() {
    const readerStatus = await this.readerAdapter.getStatus();
    return {
      ...readerStatus,
      primaryAdapter: 'figma-reader',
      fallbackAdapter: 'openfig-core',
      legacyAdapter: 'figma-export-legacy (OPTIONAL / LEGACY)',
      hasSynchronizedDesign: Boolean(this.currentSync?.ref),
      currentFileKey: this.currentSync?.fileKey || null,
      currentFileName: this.currentSync?.fileName || null,
      currentTarget: this.currentSync?.target || null,
      selectedNodeId: this.currentSync?.selectedNodeId || null,
      acquiredAt: this.currentSync?.ref?.acquiredAt || null,
      sourceVersion: this.currentSync?.ref?.sourceVersion || null,
      activeJobs: this.jobManager.listJobs().slice(0, 10),
      auditLogs: this.readerAdapter.getAuditLogs().slice(-25),
    };
  }

  async setSessionAuthState({ loggedIn = false, email = null, accountName = null } = {}) {
    if (typeof this.readerAdapter.setSessionAuthState === 'function') {
      this.readerAdapter.setSessionAuthState({ loggedIn, email, accountName });
    }
    return this.getStatus();
  }

  async login({ waitSeconds = 0, url = null, mode = 'login' } = {}) {
    return this.readerAdapter.login({ waitSeconds, url, mode });
  }

  async openBrowser({ url = null, mode = 'account' } = {}) {
    return this.readerAdapter.openBrowserWindow({ url, mode });
  }

  hasCachedFigForKey(fileKey) {
    if (!fileKey) return false;
    const candidate = path.join(this.readerAdapter.cacheDir, `${fileKey}.fig`);
    return fs.existsSync(candidate);
  }

  /**
   * Direct Figma Synchronization (Section 6):
   * 1. Validate Figma URL & permitted hostname (or local .fig path inside workspace)
   * 2. Parse file key & node ID
   * 3. Check figma-reader availability
   * 4. Check authenticated browser status
   * 5. Launch authorized acquisition
   * 6. Collect actual outputs
   * 7. Normalize the data
   * 8. Save a private local snapshot
   * 9. Return design metadata and selected node data
   */
  async sync({
    url = null,
    localFigPath = null,
    refresh = false,
    nodeId = null,
    captureImage = false,
    openBrowserOnAuthRequired = false,
    allowDevFallback = false,
  } = {}) {
    const rawTarget = localFigPath || url;
    if (!rawTarget || typeof rawTarget !== 'string') {
      const err = new Error('يرجى إدخال رابط تصميم Figma صالح للمزامنة.');
      err.status = 400;
      throw err;
    }

    let isLocalFig = /\.fig$/i.test(rawTarget.trim());
    let parsedUrl = null;
    let effectiveTarget = rawTarget.trim();
    let effectiveNodeId = nodeId ? String(nodeId).replace(/-/g, ':') : null;
    let usedDevFallback = false;

    if (!isLocalFig) {
      // Step 1 & 2: Validate Figma URL & hostname (prevents SSRF) and parse fileKey + nodeId
      try {
        parsedUrl = parseFigmaUrl(effectiveTarget);
      } catch (e) {
        const err = new Error(e.message);
        err.status = 400;
        throw err;
      }
      if (parsedUrl.surface === 'figjam') {
        const err = new Error('روابط FigJam غير مدعومة في مسار مطابقة واجهات React. استخدم رابط Figma Design.');
        err.status = 400;
        throw err;
      }
      if (parsedUrl.isLocalDevUrl && parsedUrl.localFigPath) {
        const resolvedDevFig = path.resolve(this.cwd, parsedUrl.localFigPath);
        if (fs.existsSync(resolvedDevFig)) {
          isLocalFig = true;
          effectiveTarget = resolvedDevFig;
        } else {
          effectiveTarget = parsedUrl.url;
        }
      } else {
        effectiveTarget = parsedUrl.url;
      }
      if (!effectiveNodeId && parsedUrl.nodeId) {
        effectiveNodeId = parsedUrl.nodeId;
      }
    } else {
      const resolved = path.resolve(this.cwd, effectiveTarget);
      const rel = path.relative(this.cwd, resolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        const err = new Error('مسار ملف .fig خارج مجلد المشروع المسموح.');
        err.status = 400;
        throw err;
      }
      if (!fs.existsSync(resolved)) {
        const err = new Error(`ملف .fig المحلي غير موجود: ${rel}`);
        err.status = 404;
        throw err;
      }
      effectiveTarget = resolved;
    }

    // Step 3: Check figma-reader availability
    if (!this.readerAdapter.isInstalled()) {
      const err = new Error('الأداة الأساسية @leogcode/figma-reader غير مثبتة.');
      err.status = 503;
      err.reason = 'figma_reader_not_installed';
      throw err;
    }

    // Step 4: Check authenticated browser status when syncing a live Figma URL
    const defaultFixtureFig = path.resolve(this.cwd, 'fixtures', 'sample-design.fig');
    let authStatus = null;
    if (!isLocalFig && !this.readerAdapter.execRunner) {
      authStatus = await this.readerAdapter.getStatus();
      const canUseCached = !refresh && this.hasCachedFigForKey(parsedUrl.fileKey);
      const hasRealBrowserAuth = Boolean(authStatus.loginCookieSeen);
      if (allowDevFallback && !hasRealBrowserAuth && !canUseCached && fs.existsSync(defaultFixtureFig)) {
        isLocalFig = true;
        usedDevFallback = true;
        effectiveTarget = defaultFixtureFig;
        if (openBrowserOnAuthRequired) {
          this.readerAdapter
            .openBrowserWindow({ url: parsedUrl.url, mode: 'login' })
            .catch(() => {});
        }
      } else if (!authStatus.loggedIn && !canUseCached) {
        if (allowDevFallback && fs.existsSync(defaultFixtureFig)) {
          isLocalFig = true;
          usedDevFallback = true;
          effectiveTarget = defaultFixtureFig;
        } else {
          let browserLaunch = null;
          if (openBrowserOnAuthRequired) {
            browserLaunch = await this.readerAdapter.openBrowserWindow({
              url: effectiveTarget,
              mode: 'login',
            });
          }
          const err = new Error(
            browserLaunch?.ok
              ? 'تم فتح المتصفح المخصص تلقائيًا لتسجيل الدخول إلى حساب Figma. أكمل تسجيل الدخول في النافذة المفتوحة ثم اضغط «مزامنة من Figma» مرة أخرى.'
              : 'جلسة المتصفح المخصصة لـ figma-reader غير مسجلة الدخول إلى Figma بعد. لا يمكن سحب ملف سحابي خاص بدون مصادقة.'
          );
          err.status = 401;
          err.reason = 'auth_required';
          err.blocked = true;
          err.browserOpened = Boolean(browserLaunch?.ok);
          err.recovery =
            'اضغط على زر «فتح المتصفح وتسجيل الدخول» أو أكمل تسجيل الدخول في نافذة المتصفح المخصص المفتوحة، ثم اضغط «مزامنة من Figma».';
          err.authStatus = authStatus;
          throw err;
        }
      }
    }

    // Step 5, 6, 7: Launch bounded acquisition & normalize data
    const { job, result } = await this.jobManager.runBounded(
      {
        type: refresh ? 'figma-refresh' : 'figma-sync',
        target: effectiveTarget,
        nodeId: effectiveNodeId,
      },
      async () => {
        try {
          return await this.readerAdapter.syncDesign(effectiveTarget, {
            nodeId: effectiveNodeId,
            refresh: Boolean(refresh),
            captureImage: Boolean(captureImage),
          });
        } catch (cliErr) {
          // If allowDevFallback is enabled and live cloud sync failed (e.g. locked profile or unauthenticated), fall back to local fixture + URL node resolver
          if (!isLocalFig && allowDevFallback && fs.existsSync(defaultFixtureFig)) {
            isLocalFig = true;
            usedDevFallback = true;
            effectiveTarget = defaultFixtureFig;
            try {
              return await this.readerAdapter.syncDesign(defaultFixtureFig, {
                nodeId: effectiveNodeId,
                refresh: false,
                captureImage: Boolean(captureImage),
              });
            } catch {
              return await this.openFigAdapter.parseFigFile(defaultFixtureFig, {
                nodeId: effectiveNodeId,
              });
            }
          }
          // If local .fig file was requested and figma-reader failed, try OpenFig Core fallback
          if (isLocalFig) {
            return await this.openFigAdapter.parseFigFile(effectiveTarget, {
              nodeId: effectiveNodeId,
            });
          }
          throw cliErr;
        }
      }
    );

    // Step 8: Track revision changes & save private local snapshot (never deletes existing snapshots)
    const hasRealScreenshot = Boolean(result.screenshot?.ok && result.screenshot.bytes);
    if (hasRealScreenshot) {
      const safeAssetKey = `${result.fileKey || 'local'}-${String(result.selectedNodeId || 'node').replace(/[^a-zA-Z0-9-]/g, '-')}`;
      const savedImgPath = savePrivatePng(
        this.dataDir,
        safeAssetKey,
        result.screenshot.bytes
      );
      result.ref.previewSource = 'figma-reader-screenshot';
      result.ref.previewUrl = `/api/figma-connector/assets/${encodeURIComponent(safeAssetKey)}`;
      result.ref.figmaImageUrl = result.ref.previewUrl;
      result.ref.screenshotPath = savedImgPath;
    }

    const requestedCleanNodeId = effectiveNodeId ? String(effectiveNodeId).replace(/-/g, ':') : null;
    const nodeMismatchWithRequest = Boolean(
      requestedCleanNodeId && result.selectedNodeId !== requestedCleanNodeId
    );
    const hasCustomUrlTarget = Boolean(
      parsedUrl &&
        parsedUrl.fileKey &&
        parsedUrl.fileKey !== 'vMYpz8Jc3EzVUsLQCDx3Jd' &&
        parsedUrl.fileKey !== 'local-dev-http' &&
        parsedUrl.fileKey !== 'local-fig'
    );

    if (
      !hasRealScreenshot &&
      result?.ref &&
      (usedDevFallback || nodeMismatchWithRequest || hasCustomUrlTarget || requestedCleanNodeId === '0:1')
    ) {
      const resolvedUrlNode = resolveUrlDesignNode(parsedUrl?.url || rawTarget, {
        nodeId: requestedCleanNodeId || result.selectedNodeId,
        baseRef: result.ref,
      });
      result.ref = {
        ...result.ref,
        ...resolvedUrlNode,
        previewSource: 'figma-url-node-render',
      };
      result.ref.figmaImageUrl = result.ref.previewUrl;
      result.selectedNodeId = resolvedUrlNode.nodeId;
    } else if (usedDevFallback && parsedUrl && result?.ref) {
      if (parsedUrl.fileKey) result.ref.fileKey = parsedUrl.fileKey;
      if (parsedUrl.fileName) result.ref.fileName = parsedUrl.fileName;
      result.ref.extractedUrl = parsedUrl.url || rawTarget;
    }

    if (result?.ref && !hasRealScreenshot) {
      result.ref.previewUrl = buildFigmaDesignImageDataUrl(result.ref);
      result.ref.figmaImageUrl = result.ref.previewUrl;
      result.ref.previewSource = result.ref.previewSource || 'figma-node-svg-render';
    }

    const currentFp = fingerprintReference(result.ref);
    const change = diffRevisions(this.previousFingerprint, currentFp);
    this.previousFingerprint = currentFp;

    const snapshotMeta = saveDesignSnapshot(this.snapshotDir, {
      fileKey: parsedUrl?.fileKey || result.fileKey || 'local-fig',
      nodeId: result.selectedNodeId,
      canonicalNode: result.ref,
      treeOutline: result.hierarchy?.outline || '',
      pages: result.hierarchy?.pages || [],
      rawNode: result.rawNode || null,
    });

    this.currentSync = {
      target: effectiveTarget,
      isLocalFig,
      usedDevFallback,
      fileKey: parsedUrl?.fileKey || result.fileKey || 'local-fig',
      fileName: parsedUrl?.fileName || result.fileName || 'Figma Design',
      selectedNodeId: result.selectedNodeId,
      exportedAt: result.exportedAt || null,
      fileModifiedAt: result.fileModifiedAt || null,
      account: result.account || null,
      adapter: result.adapter || 'figma-reader',
      source: result.source,
      ref: result.ref,
      previewUrl: result.ref?.previewUrl || null,
      figmaImageUrl: result.ref?.figmaImageUrl || result.ref?.previewUrl || null,
      index: result.index || [],
      hierarchy: result.hierarchy || { pages: [], frames: [], components: [], allNodes: [] },
      change,
      snapshot: snapshotMeta,
      job,
      syncedAt: new Date().toISOString(),
    };

    return this.currentSync;
  }

  async ensureDefaultDesignLoaded(nodeId = '942:2734') {
    if (this.currentSync) return this.currentSync;
    if (this.pendingInitPromise) {
      return this.pendingInitPromise;
    }
    const defaultFig = path.resolve(this.cwd, 'fixtures', 'sample-design.fig');
    if (!fs.existsSync(defaultFig) || !this.readerAdapter.isInstalled()) {
      return null;
    }
    this.pendingInitPromise = (async () => {
      try {
        const result = await this.readerAdapter.syncDesign(defaultFig, {
          nodeId,
          refresh: false,
          captureImage: false,
        });
        if (result?.ref && !result.ref.previewUrl) {
          result.ref.previewUrl = buildFigmaDesignImageDataUrl(result.ref);
          result.ref.figmaImageUrl = result.ref.previewUrl;
        }
        if (!this.currentSync) {
          this.currentSync = {
            target: defaultFig,
            isLocalFig: true,
            fileKey: result.fileKey || 'local-fig',
            fileName: result.fileName || 'sample-design.fig',
            selectedNodeId: result.selectedNodeId,
            exportedAt: result.exportedAt || null,
            fileModifiedAt: result.fileModifiedAt || null,
            account: result.account || null,
            adapter: result.adapter || 'figma-reader',
            source: result.source,
            ref: result.ref,
            previewUrl: result.ref?.previewUrl || null,
            figmaImageUrl: result.ref?.figmaImageUrl || result.ref?.previewUrl || null,
            index: result.index || [],
            hierarchy: result.hierarchy || { pages: [], frames: [], components: [], allNodes: [] },
            change: { changed: false, count: 0, fields: [], summary: '' },
            snapshot: null,
            job: null,
            syncedAt: new Date().toISOString(),
          };
        }
        return this.currentSync;
      } catch {
        return null;
      } finally {
        this.pendingInitPromise = null;
      }
    })();
    return this.pendingInitPromise;
  }

  async getPages() {
    if (!this.currentSync) {
      await this.ensureDefaultDesignLoaded('942:2734');
    }
    if (!this.currentSync) {
      return {
        ok: true,
        hasDesign: false,
        pages: [],
        frames: [],
        components: [],
        allNodes: [],
      };
    }
    return {
      ok: true,
      hasDesign: true,
      fileKey: this.currentSync.fileKey,
      fileName: this.currentSync.fileName,
      selectedNodeId: this.currentSync.selectedNodeId,
      adapter: this.currentSync.adapter,
      pages: this.currentSync.hierarchy?.pages || [],
      frames: this.currentSync.hierarchy?.frames || [],
      components: this.currentSync.hierarchy?.components || [],
      allNodes: this.currentSync.hierarchy?.allNodes || this.currentSync.index || [],
      outline: this.currentSync.hierarchy?.outline || '',
    };
  }

  async getNode(nodeId) {
    if (!nodeId || typeof nodeId !== 'string') {
      const err = new Error('معرّف العقدة مطلوب.');
      err.status = 400;
      throw err;
    }
    const cleanId = decodeURIComponent(nodeId).replace(/-/g, ':');
    if (!this.currentSync) {
      await this.ensureDefaultDesignLoaded(cleanId);
      if (this.currentSync && this.currentSync.selectedNodeId === cleanId) {
        return {
          ok: true,
          nodeId: this.currentSync.selectedNodeId,
          ref: this.currentSync.ref,
          previewUrl: this.currentSync.ref?.previewUrl || null,
          figmaImageUrl: this.currentSync.ref?.figmaImageUrl || this.currentSync.ref?.previewUrl || null,
          rawNode: null,
        };
      }
      if (!this.currentSync) {
        const err = new Error('لا يوجد تصميم متزامن حاليًا. قم بمزامنة رابط Figma أو ملف .fig أولًا.');
        err.status = 404;
        throw err;
      }
    }

    const { rawNode, canonical: baseCanonical } = await this.readerAdapter.getNode(this.currentSync.target, {
      nodeId: cleanId,
      depth: 3,
      refresh: false,
      fileKey: this.currentSync.fileKey,
      fileName: this.currentSync.fileName,
    });

    let canonical = baseCanonical;
    if (canonical && (cleanId === '0:1' || canonical.nodeId !== cleanId)) {
      const resolvedUrlNode = resolveUrlDesignNode(
        this.currentSync.ref?.extractedUrl || `https://www.figma.com/design/${this.currentSync.fileKey}/${this.currentSync.fileName}?node-id=${cleanId.replace(':', '-')}`,
        {
          nodeId: cleanId,
          baseRef: canonical,
        }
      );
      canonical = {
        ...canonical,
        ...resolvedUrlNode,
        previewSource: 'figma-url-node-render',
      };
    }

    if (canonical) {
      canonical.previewUrl = buildFigmaDesignImageDataUrl(canonical);
      canonical.figmaImageUrl = canonical.previewUrl;
    }

    const currentFp = fingerprintReference(canonical);
    const change = diffRevisions(this.previousFingerprint, currentFp);
    this.previousFingerprint = currentFp;

    this.currentSync.selectedNodeId = canonical.nodeId;
    this.currentSync.ref = canonical;
    this.currentSync.previewUrl = canonical.previewUrl;
    this.currentSync.figmaImageUrl = canonical.figmaImageUrl;
    this.currentSync.change = change;

    const snapshotMeta = saveDesignSnapshot(this.snapshotDir, {
      fileKey: this.currentSync.fileKey,
      nodeId: canonical.nodeId,
      canonicalNode: canonical,
      treeOutline: this.currentSync.hierarchy?.outline || '',
      pages: this.currentSync.hierarchy?.pages || [],
      rawNode,
    });
    this.currentSync.snapshot = snapshotMeta;

    return {
      ok: true,
      nodeId: canonical.nodeId,
      ref: canonical,
      previewUrl: canonical.previewUrl,
      figmaImageUrl: canonical.figmaImageUrl,
      rawNode,
      change,
      snapshot: snapshotMeta,
    };
  }

  async refresh({ url = null, nodeId = null, allowDevFallback = false } = {}) {
    const targetUrl = url || (this.currentSync && !this.currentSync.isLocalFig ? this.currentSync.target : null);
    const localFigPath = !targetUrl && this.currentSync?.isLocalFig ? this.currentSync.target : null;
    if (!targetUrl && !localFigPath) {
      const err = new Error('لا يوجد مصدر تصميم سابق لتحديثه. أدخل رابط Figma أولًا.');
      err.status = 400;
      throw err;
    }
    return this.sync({
      url: targetUrl,
      localFigPath,
      nodeId: nodeId || this.currentSync?.selectedNodeId || null,
      refresh: true,
      allowDevFallback,
    });
  }

  compare({ reference = null, actual = null, visual = null, options = {} } = {}) {
    const effectiveRef = reference || this.currentSync?.ref;
    if (!effectiveRef || !actual) {
      const err = new Error('بيانات المرجع (reference) وبيانات التنفيذ الفعلي (actual) مطلوبة لإجراء المقارنة.');
      err.status = 400;
      throw err;
    }
    return {
      ok: true,
      comparedAt: new Date().toISOString(),
      ...calculateFidelityAndEvidence(effectiveRef, actual, visual, options),
    };
  }

  async compareWithAi({
    reference = null,
    actual = null,
    visual = null,
    preferredModel = 'gemini-flash-latest',
    apiKey = null,
  } = {}) {
    const effectiveRef = reference || this.currentSync?.ref;
    if (!effectiveRef || !actual) {
      const err = new Error('بيانات المرجع (reference) وبيانات التنفيذ الفعلي (actual) مطلوبة للمقارنة الذكية.');
      err.status = 400;
      throw err;
    }
    return compareWithGemini({
      reference: effectiveRef,
      actual,
      visual,
      preferredModel,
      apiKey,
    });
  }

  saveReport(payload = {}) {
    const reportId =
      payload.reportId && SAFE_REPORT_ID_RE.test(payload.reportId)
        ? payload.reportId
        : `rep-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const enriched = {
      ...payload,
      reportId,
      generatedAt: payload.generatedAt || new Date().toISOString(),
      auditLogs: payload.auditLogs || this.readerAdapter.getAuditLogs().slice(-25),
    };
    const html = generateHtmlReport(enriched);
    const json = generateJsonReport(enriched);

    const htmlPath = path.join(this.reportsDir, `${reportId}.html`);
    const jsonPath = path.join(this.reportsDir, `${reportId}.json`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    fs.writeFileSync(jsonPath, json, 'utf8');
    // Also update out/client-report.html for legacy link compatibility
    const defaultClientHtml = path.resolve(this.cwd, 'out', 'client-report.html');
    fs.mkdirSync(path.dirname(defaultClientHtml), { recursive: true });
    fs.writeFileSync(defaultClientHtml, html, 'utf8');

    const record = {
      reportId,
      generatedAt: enriched.generatedAt,
      htmlPath,
      jsonPath,
      htmlUrl: `/api/reports/${reportId}?format=html`,
      jsonUrl: `/api/reports/${reportId}?format=json`,
      legacyHref: '/api/figma-connector/report-file?name=client-report.html',
    };
    this.reports.set(reportId, record);
    return record;
  }

  getReport(reportId, format = 'html') {
    if (!reportId || !SAFE_REPORT_ID_RE.test(reportId)) {
      return null;
    }
    const ext = format === 'json' ? 'json' : 'html';
    const filePath = path.join(this.reportsDir, `${reportId}.${ext}`);
    const rel = path.relative(this.reportsDir, filePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath)) {
      return null;
    }
    return {
      reportId,
      format: ext,
      contentType: ext === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      content: fs.readFileSync(filePath),
    };
  }
}

export { runPixelmatchComparison, runRegCliReport, readDesignSnapshot };

