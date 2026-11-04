import React, { useEffect, useMemo, useState } from 'react';
import { compareSpecs, EXTENDED_FIELDS } from '../../lib/compare.mjs';
import {
  buildFigmaDesignImageDataUrl,
  resolveUrlDesignNode,
} from '../../lib/figma-image-generator.mjs';
import { parseFigmaUrl } from '../../integrations/figma/figma-url-parser.mjs';
import {
  compareParsersOnFixture,
  fetchFigmaNode,
  fetchFigmaPages,
  fetchFigmaReaderStatus,
  fetchLastSync,
  importFigBytes,
  importZipBytes,
  inspectReactWithPlaywright,
  openFigmaBrowser,
  refreshFigmaDesign,
  runGeminiAiComparison,
  runVisualComparisonApi,
  saveClientReport,
  saveReportApi,
  syncFigmaDesign,
  updateFigmaSessionStatus,
} from '../../integrations/figma/figma-connector-client.mjs';
import {
  GEMINI_MODEL_CASCADE,
  buildLocalDeterministicAiFallback,
} from '../../comparison/ai-engine/gemini-comparison.mjs';
import { importFigmaExportZip, importJsonObject } from '../../lib/import-design.mjs';
import { buildClientReport, generateJsonReport } from '../../lib/client-report.mjs';
import { matchSelectedPair } from '../../lib/match-nodes.mjs';
import { getScenarioById } from '../../inspection/storybook/storybook-scenarios.mjs';
import { SplashScreen } from '../../components/SplashScreen.jsx';
import { FigmaSourcePanel } from '../components/FigmaSourcePanel.jsx';
import { DesignExplorerPanel } from '../components/DesignExplorerPanel.jsx';
import { ReactImplementationPanel } from '../components/ReactImplementationPanel.jsx';
import { ComparisonDashboardPanel } from '../components/ComparisonDashboardPanel.jsx';
import { ReportsAuditPanel } from '../components/ReportsAuditPanel.jsx';

export function demoActual(ref) {
  return {
    width: Number(ref?.width || 112) + 28,
    height: Number(ref?.height || 100),
    backgroundColor: ref?.backgroundColor || '#FF9A62',
    borderRadius: ref?.borderRadius ?? 6,
    text: ref?.text || ref?.nodeName || 'Buy ice cream',
  };
}

export function copiedActual(ref) {
  const actual = demoActual(ref);
  actual.width = Number(ref?.width || 112);
  for (const field of EXTENDED_FIELDS) {
    if (ref?.[field.key] != null) actual[field.key] = ref[field.key];
  }
  return actual;
}

export function DashboardPage() {
  const [activePage, setActivePage] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === '#settings' ? 'settings' : 'main'
  );
  const [ref, setRef] = useState(null);
  const [actual, setActual] = useState(null);
  const [statusMessage, setStatusMessage] = useState('جارٍ تهيئة محرك مطابقة Figma والتأكد من جاهزية figma-reader...');
  const [figmaUrl, setFigmaUrl] = useState(
    'https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=942-2734'
  );
  const [urlInfo, setUrlInfo] = useState(null);
  const [readerStatus, setReaderStatus] = useState({
    installed: true,
    state: 'requires_login',
    loggedIn: false,
    message: 'جارٍ فحص حالة figma-reader...',
    auditLogs: [],
  });
  const [syncProgress, setSyncProgress] = useState('جاهز للإرسال والمطابقة واستخراج النتائج');
  const [hierarchy, setHierarchy] = useState({ pages: [], frames: [], components: [], allNodes: [] });
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [visual, setVisual] = useState(null);
  const [busy, setBusy] = useState(false);
  const [auditedAt, setAuditedAt] = useState('');
  const [reportHref, setReportHref] = useState('');
  const [reportRecord, setReportRecord] = useState(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState('IncorrectWidth');
  const [playwrightInspection, setPlaywrightInspection] = useState(null);
  const [parserComparison, setParserComparison] = useState(null);
  const [preferredAiModel, setPreferredAiModel] = useState('gemini-flash-latest');
  const [aiComparison, setAiComparison] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const authMutationSeq = React.useRef(0);
  const aiReqSeq = React.useRef(0);

  function switchPage(nextPage) {
    setActivePage(nextPage);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', nextPage === 'settings' ? '#settings' : '#main');
    }
  }

  useEffect(() => {
    let stop = false;
    fetchLastSync()
      .then(saved => {
        if (stop || !saved?.ref) throw new Error('empty');
        const imgUrl = saved.previewUrl || saved.ref?.previewUrl || buildFigmaDesignImageDataUrl(saved.ref);
        setRef({ ...saved.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl });
        setActual(demoActual(saved.ref));
        setNodes(saved.index || []);
        setPreviewUrl(imgUrl);
        if (saved.change?.summary) setChangeNote(saved.change.summary);
        setStatusMessage(`عُرضت آخر مزامنة محفوظة محليًا وتم جلب صورة تصميم فيجما${saved.savedAt ? ` (${saved.savedAt})` : ''}.`);
      })
      .catch(() =>
        fetch('/reference.json', { cache: 'no-store' })
          .then(response => {
            if (!response.ok) throw new Error('reference.json غير متاح');
            return response.json();
          })
          .then(data => {
            if (stop) return;
            const imgUrl = data?.previewUrl || buildFigmaDesignImageDataUrl(data);
            setRef({ ...data, previewUrl: imgUrl, figmaImageUrl: imgUrl });
            setActual(demoActual(data));
            setPreviewUrl(imgUrl);
            setStatusMessage('تم تحميل بيانات وصورة تصميم فيجما المرجعية. أدخل الرابط واضغط «إرسال ومطابقة واستخراج النتائج والمقارنة».');
          })
          .catch(error => {
            if (!stop) setStatusMessage(error.message);
          })
      );

    fetchFigmaPages()
      .then(data => {
        if (stop || !data) return;
        setHierarchy({
          pages: data.pages || [],
          frames: data.frames || [],
          components: data.components || [],
          allNodes: data.allNodes || [],
        });
        if (data.allNodes?.length) setNodes(data.allNodes);
      })
      .catch(() => {});

    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const pollStatus = () => {
      const seqAtStart = authMutationSeq.current;
      fetchFigmaReaderStatus()
        .then(status => {
          if (!stop && authMutationSeq.current === seqAtStart) {
            setReaderStatus(status);
          }
        })
        .catch(() => {
          if (!stop && authMutationSeq.current === seqAtStart) {
            setReaderStatus(prev => ({
              ...prev,
              state: 'disconnected',
              message: 'الخادم المحلي لا يستجيب. تأكد من تشغيل npm run dev.',
            }));
          }
        });
    };
    pollStatus();
    const timer = setInterval(pollStatus, 6000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  const comparison = useMemo(() => compareSpecs(ref, actual), [ref, actual]);
  const defaultAiComparison = useMemo(
    () => (ref && actual ? buildLocalDeterministicAiFallback(ref, actual, comparison, visual) : null),
    [ref, actual, comparison, visual]
  );
  const effectiveAiComparison = aiComparison || defaultAiComparison;

  useEffect(() => {
    setAiComparison(null);
  }, [ref, actual]);

  const genuineVisual =
    (visual?.source === 'figma-plugin-export' ||
      visual?.source === 'figma-reader-screenshot' ||
      visual?.source === 'genuine-figma-image-user-supplied') &&
    typeof visual.pixelSimilarity === 'number'
      ? visual.pixelSimilarity
      : null;

  function handleParseUrl() {
    try {
      const parsed = parseFigmaUrl(figmaUrl);
      setUrlInfo(parsed);
      if (parsed.nodeId) setSelectedNodeId(parsed.nodeId);
      setStatusMessage(
        `تم تحليل الرابط بنجاح (${parsed.isHttpDev ? 'وضع التطوير HTTP' : 'HTTPS'}): مفتاح الملف ${parsed.fileKey} | العقدة ${parsed.nodeId || 'غير محددة'}.`
      );
    } catch (error) {
      setUrlInfo(null);
      setStatusMessage(error.message);
    }
  }

  async function handleToggleAuthSession(nextLoggedIn) {
    authMutationSeq.current += 1;
    setBusy(true);
    try {
      const updated = await updateFigmaSessionStatus({
        loggedIn: Boolean(nextLoggedIn),
        email: nextLoggedIn ? 'mahmoud-gala-dev@figma.com' : null,
        accountName: 'figma-fidelity-mvp',
      });
      setReaderStatus(updated);
      setStatusMessage(
        updated.loggedIn
          ? 'تم تأكيد تسجيل الدخول على حساب Figma بنجاح — اختفت أزرار فتح المتصفح لتقليل الازدحام البصري.'
          : 'تم التبديل إلى وضع غير مسجل — ظهرت أزرار فتح المتصفح لتسجيل الدخول إلى حساب Figma.'
      );
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshAuthStatus() {
    setBusy(true);
    try {
      const status = await fetchFigmaReaderStatus();
      setReaderStatus(status);
      setStatusMessage(
        status.loggedIn
          ? `الحساب مسجل الدخول حاليًا (${status.user?.email || status.account?.name || 'figma-fidelity-mvp'}).`
          : 'الحساب غير مسجل الدخول حاليًا — يمكنك فتح المتصفح لتسجيل الدخول.'
      );
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRunGeminiCompare(customRef = ref, customActual = actual) {
    if (!customRef || !customActual) return;
    const reqId = ++aiReqSeq.current;
    setAiBusy(true);
    try {
      const res = await runGeminiAiComparison({
        reference: customRef,
        actual: customActual,
        visual,
        preferredModel: preferredAiModel,
      });
      if (aiReqSeq.current === reqId) {
        setAiComparison(res);
        setStatusMessage(
          `اكتملت المقارنة الذكية وتفسير النسب بالمارك داون عبر ${res.usedModel || preferredAiModel}: الدرجة الذكية ${res.aiScore}% (${res.verdict}).`
        );
      }
    } catch (error) {
      if (aiReqSeq.current === reqId) {
        setStatusMessage(error.message);
      }
    } finally {
      if (aiReqSeq.current === reqId) {
        setAiBusy(false);
      }
    }
  }

  async function handleLoginFigmaReader() {
    setBusy(true);
    setSyncProgress('جارٍ فتح المتصفح المخصص لـ figma-reader لتسجيل الدخول فوراً...');
    try {
      const res = await openFigmaBrowser({ mode: 'login', url: 'https://www.figma.com/login' });
      setStatusMessage(res.message || 'فُتحت نافذة تسجيل الدخول لـ figma-reader فوراً.');
      setSyncProgress(res.message || 'نافذة المتصفح مفتوحة الآن لتسجيل الدخول');
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});
    } catch (error) {
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
      setSyncProgress('تعذر فتح نافذة تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenFigmaAccount() {
    setBusy(true);
    setSyncProgress('جارٍ فتح المتصفح المخصص على حساب وملفات Figma فوراً...');
    try {
      const res = await openFigmaBrowser({ mode: 'account', url: 'https://www.figma.com/files' });
      setStatusMessage(res.message || 'تم فتح المتصفح المخصص على حساب Figma فوراً.');
      setSyncProgress(res.message || 'نافذة حساب Figma مفتوحة الآن');
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});
    } catch (error) {
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
      setSyncProgress('تعذر فتح حساب Figma في المتصفح');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenCurrentUrlInBrowser() {
    setBusy(true);
    setSyncProgress('جارٍ فتح الرابط الحالي في المتصفح المخصص فوراً...');
    try {
      const res = await openFigmaBrowser({ mode: 'design', url: figmaUrl });
      setStatusMessage(res.message || 'تم فتح الرابط في المتصفح المخصص فوراً.');
      setSyncProgress(res.message || 'نافذة التصميم مفتوحة الآن في المتصفح');
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});
    } catch (error) {
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
      setSyncProgress('تعذر فتح الرابط في المتصفح');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Unified Single-Button Workflow:
   * 1. Parses the Figma URL
   * 2. Syncs & extracts Figma design data
   * 3. Fetches/renders the Figma design image
   * 4. Compares Current Design vs Figma Design data
   * 5. Runs Gemini AI comparison to explain percentage reasons in full Markdown
   */
  async function handleUnifiedSendAndCompare(refresh = false) {
    setBusy(true);
    setChangeNote('');
    setSyncProgress(
      refresh
        ? 'جارٍ تحديث بيانات وصورة تصميم فيجما وإعادة المقارنة...'
        : 'جارٍ إرسال الرابط وجلب صورة وبيانات تصميم فيجما وإجراء المقارنة الذكية...'
    );
    try {
      const parsed = parseFigmaUrl(figmaUrl);
      setUrlInfo(parsed);
      const requestedNodeId = parsed.nodeId || '0:1';
      const synced = refresh
        ? await refreshFigmaDesign({
            url: figmaUrl,
            nodeId: requestedNodeId,
            allowDevFallback: true,
          })
        : await syncFigmaDesign({
            url: figmaUrl,
            refresh: false,
            nodeId: requestedNodeId,
            captureImage: true,
            openBrowserOnAuthRequired: false,
            allowDevFallback: true,
          });

      const syncedAt = synced.syncedAt || new Date().toISOString();
      const resolvedRef = resolveUrlDesignNode(figmaUrl, {
        nodeId: requestedNodeId,
        baseRef: synced.ref,
        syncedAt,
      });

      const imgUrl =
        synced.ref?.previewSource === 'figma-reader-screenshot' && synced.previewUrl
          ? (synced.previewUrl.includes('?') ? synced.previewUrl : `${synced.previewUrl}?t=${Date.now()}`)
          : buildFigmaDesignImageDataUrl({ ...resolvedRef, syncedAt });

      const enrichedRef = {
        ...(synced.ref || {}),
        ...resolvedRef,
        previewUrl: imgUrl,
        figmaImageUrl: imgUrl,
        syncedAt,
      };
      const nodeChanged =
        !actual ||
        enrichedRef.nodeId !== ref?.nodeId ||
        enrichedRef.fileKey !== ref?.fileKey ||
        enrichedRef.fileName !== ref?.fileName;
      const nextActual = nodeChanged ? demoActual(enrichedRef) : actual;

      setRef(enrichedRef);
      setActual(nextActual);
      setPreviewUrl(imgUrl);
      setSelectedNodeId(enrichedRef.nodeId || synced.selectedNodeId || '');
      if (synced.hierarchy) setHierarchy(synced.hierarchy);
      if (synced.index) setNodes(synced.index);
      if (synced.change?.summary) setChangeNote(synced.change.summary);

      setSyncProgress(`تم جلب صورة وبيانات فيجما واستخراج المقارنة (${enrichedRef.syncedAt})`);
      setStatusMessage(
        `تم إرسال الرابط وجلب صورة وبيانات تصميم فيجما للعقدة ${enrichedRef.nodeId} (${enrichedRef.nodeName}) ومقارنتها بالتصميم الحالي.`
      );
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});

      // Trigger AI comparison in parallel to update full Markdown report & percentage reasons
      handleRunGeminiCompare(enrichedRef, nextActual);
    } catch (error) {
      setSyncProgress(`توقفت العملية: ${error.code || 'تحقق من الرابط'}`);
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncLocalFixture() {
    setBusy(true);
    setChangeNote('');
    setSyncProgress('جارٍ مزامنة ملف fixtures/sample-design.fig عبر figma-reader CLI...');
    try {
      const synced = await syncFigmaDesign({
        localFigPath: 'fixtures/sample-design.fig',
        nodeId: selectedNodeId || '942:2734',
        refresh: false,
      });
      const syncedAt = synced.syncedAt || new Date().toISOString();
      const imgUrl = synced.previewUrl || synced.ref?.previewUrl || buildFigmaDesignImageDataUrl({ ...synced.ref, syncedAt });
      const enrichedRef = { ...synced.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl, syncedAt };
      setRef(enrichedRef);
      setActual(copiedActual(enrichedRef));
      setPreviewUrl(imgUrl);
      setSelectedScenarioId('ExactMatch');
      setSelectedNodeId(synced.selectedNodeId || '942:2734');
      if (synced.hierarchy) setHierarchy(synced.hierarchy);
      if (synced.index) setNodes(synced.index);
      if (synced.change?.summary) setChangeNote(synced.change.summary);
      setSyncProgress(`تم استخراج وتطبيع التصميم عبر figma-reader (${syncedAt})`);
      setStatusMessage(
        `تمت المزامنة الفعلية عبر figma-reader للعقدة ${synced.selectedNodeId} (${synced.ref?.nodeName}) — استُخرجت ${synced.ref?.extractionCoverage?.extractedCount} خاصية معيارية.`
      );
      const status = await fetchFigmaReaderStatus();
      setReaderStatus(status);
    } catch (error) {
      setSyncProgress('فشلت مزامنة الملف المرجعي');
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectExplorerNode(nodeId) {
    setSelectedNodeId(nodeId);
    if (!nodeId) return;
    setBusy(true);
    setSyncProgress(`جارٍ جلب خصائص وصورة العقدة ${nodeId} عبر figma-reader...`);
    try {
      const res = await fetchFigmaNode(nodeId, figmaUrl);
      if (res?.ref) {
        const syncedAt = res.ref.syncedAt || new Date().toISOString();
        const imgUrl = res.previewUrl || res.ref?.previewUrl || buildFigmaDesignImageDataUrl({ ...res.ref, syncedAt });
        const enrichedRef = { ...res.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl, syncedAt };
        setRef(enrichedRef);
        setActual(copiedActual(enrichedRef));
        setPreviewUrl(imgUrl);
        setSelectedScenarioId('ExactMatch');
        if (res.change?.summary) setChangeNote(res.change.summary);
        setSyncProgress(`تم تحميل العقدة ${res.nodeId}`);
        setStatusMessage(`تم اختيار العقدة ${res.ref.nodeName} (${res.nodeId}) وتحديث صورة وجدول المقارنة.`);
      }
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompareParsers() {
    setBusy(true);
    try {
      const res = await compareParsersOnFixture({
        figPath: 'fixtures/sample-design.fig',
        nodeId: selectedNodeId || '942:2734',
      });
      setParserComparison(res);
      setStatusMessage(
        `تمت مقارنة مخرجات figma-reader مع OpenFig Core على نفس الملف: تطابق ${res.comparison?.agreementPercentage}%.`
      );
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectScenario(scenarioId) {
    setSelectedScenarioId(scenarioId);
    const scenario = getScenarioById(scenarioId);
    if (scenario && ref) {
      setActual(scenario.apply(ref));
      setStatusMessage(`تم تطبيق سيناريو Storybook: ${scenario.label}`);
    }
  }

  async function handleRunPlaywrightInspection() {
    setBusy(true);
    try {
      const res = await inspectReactWithPlaywright({
        selector: '[data-testid="react-item"]',
        alsoInspectMobile: true,
      });
      setPlaywrightInspection(res);
      if (res.computed) {
        setActual(prev => ({
          ...prev,
          width: res.computed.width,
          height: res.computed.height,
          backgroundColor: res.computed.backgroundColor,
          borderRadius: res.computed.borderRadius,
          fontSize: res.computed.fontSize ?? prev.fontSize,
          fontFamily: res.computed.fontFamily ?? prev.fontFamily,
          text: res.computed.text || prev.text,
        }));
      }
      setAuditedAt(res.inspectedAt);
      setStatusMessage('تم فحص مكوّن React الفعلي واستخراج Computed Styles واللقطات عبر Playwright.');
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportLocalFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 50_000_000) throw new Error('الحد الأقصى للملف هو 50MB.');
      let parsed = null;
      try {
        parsed = figmaUrl.trim() ? parseFigmaUrl(figmaUrl) : null;
      } catch {
        parsed = null;
      }
      if (parsed) setUrlInfo(parsed);
      const name = file.name.toLowerCase();
      if (name.endsWith('.fig')) {
        const imported = await importFigBytes(await file.arrayBuffer(), { nodeId: parsed?.nodeId || '' });
        const imgUrl = buildFigmaDesignImageDataUrl(imported.ref);
        setRef({ ...imported.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl });
        setActual(copiedActual(imported.ref));
        setPreviewUrl(imgUrl);
        setNodes(imported.index || []);
        setStatusMessage(`قُرئ ملف .fig احتياطيًا عبر OpenFig Core (${file.name}).`);
      } else if (name.endsWith('.zip')) {
        let imported;
        try {
          imported = await importZipBytes(await file.arrayBuffer(), {
            fileKey: parsed?.fileKey || '',
            nodeId: parsed?.nodeId || '',
          });
        } catch {
          imported = importFigmaExportZip(new Uint8Array(await file.arrayBuffer()), {
            fileKey: parsed?.fileKey || null,
            nodeId: parsed?.nodeId || null,
          });
        }
        const imgUrl = imported.previewUrl || buildFigmaDesignImageDataUrl(imported.ref);
        setRef({ ...imported.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl });
        setActual(copiedActual(imported.ref));
        setNodes(imported.index || []);
        setPreviewUrl(imgUrl);
        setStatusMessage(`تم استيراد حزمة ZIP القديمة (OPTIONAL / LEGACY): ${file.name}.`);
      } else if (name.endsWith('.json')) {
        const imported = importJsonObject(JSON.parse(await file.text()), {
          nodeId: parsed?.nodeId || null,
          fileName: file.name,
        });
        const imgUrl = buildFigmaDesignImageDataUrl(imported.ref);
        setRef({ ...imported.ref, previewUrl: imgUrl, figmaImageUrl: imgUrl });
        setActual(copiedActual(imported.ref));
        setPreviewUrl(imgUrl);
        setNodes(imported.index || []);
        setStatusMessage(`تم استيراد ملف JSON محليًا: ${file.name}.`);
      } else {
        throw new Error('الأنواع المدعومة: .fig و .zip و .json.');
      }
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleVisualCompare(demo = false) {
    setBusy(true);
    try {
      const manifest = await runVisualComparisonApi({ demo });
      setVisual(manifest);
      setStatusMessage(
        manifest.source === 'missing'
          ? 'لا توجد صورة مرجعية أصلية، لذلك حُجبت درجة التشابه البصري الأصيل.'
          : `اكتملت المقارنة البصرية (${manifest.source}) وتم تحديث تقرير reg-cli.`
      );
    } catch (error) {
      setVisual(null);
      setStatusMessage(`${error.message} ${error.recovery || ''}`);
    } finally {
      setBusy(false);
    }
  }

  function buildReportPayload(generatedAt = new Date().toISOString()) {
    return {
      generatedAt,
      connection: readerStatus,
      reference: ref,
      actual,
      fidelity: {
        ...comparison,
        propertyFidelity: comparison.score,
        genuineVisualSimilarity: genuineVisual,
        visualSource: visual?.source || 'missing',
        inspectionCoverage: comparison.coverage.percentage,
        inspected: comparison.coverage.tested,
        catalogSize: EXTENDED_FIELDS.length,
        missing: EXTENDED_FIELDS.filter(field => ref?.[field.key] == null).map(field => ({
          key: field.key,
          label: field.label,
          reason: 'غير متوفر في المرجع الحالي (NOT_AVAILABLE)',
        })),
        formula: comparison.formula,
        visualFormula:
          'التشابه البصري الأصيل يُحسب فقط لصورة PNG أصلية وبعد تطابق الأبعاد 1:1 عبر Pixelmatch.',
      },
      visual,
      matching: matchSelectedPair(ref, actual),
      auditLogs: readerStatus?.auditLogs || [],
    };
  }

  async function handleGenerateHtmlReport() {
    const generatedAt = new Date().toISOString();
    setAuditedAt(generatedAt);
    const payload = buildReportPayload(generatedAt);
    const html = buildClientReport(payload);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fidelity-report.html';
    link.click();
    URL.revokeObjectURL(url);
    try {
      const [legacySaved, v2Saved] = await Promise.all([
        saveClientReport(html),
        saveReportApi(payload),
      ]);
      setReportHref(legacySaved.href);
      setReportRecord(v2Saved);
      setStatusMessage(`تم توليد وحفظ التقرير الكامل (${v2Saved.reportId}).`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  function handleDownloadJsonReport() {
    const payload = buildReportPayload(new Date().toISOString());
    const json = generateJsonReport(payload);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fidelity-report.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage('تم تنزيل تقرير JSON المقروء آليًا.');
  }

  if (!ref || !actual) {
    return (
      <main className="app">
        <h1>Figma Fidelity Engine</h1>
        <p>{statusMessage}</p>
      </main>
    );
  }

  return (
    <div className="app">
      <SplashScreen
        refNode={ref}
        actualNode={actual}
        comparison={comparison}
        readerStatus={readerStatus}
        preferredAiModel={preferredAiModel}
      />
      {/* Top Header with Main Comparison View vs Separate Settings Page Navigation */}
      <header className="app-header">
        <div>
          <div className="eyebrow">FIGMA-TO-REACT FIDELITY &amp; AI MARKDOWN AUDITOR</div>
          <h1>محرك مطابقة تصميم Figma مع التصميم الحالي بالذكاء الاصطناعي</h1>
          <p>
            أدخل رابط فيجما واضغط على زر الإرسال والمطابقة لاستخراج صورة تصميم فيجما، وجدول مقارنة البيانات، وتفسير أسباب النسب المئوية بالمارك داون الكامل.
          </p>
        </div>

        <nav className="page-nav-tabs" aria-label="التنقل بين صفحة المطابقة وصفحة الإعدادات">
          <button
            type="button"
            className={`nav-tab-btn ${activePage === 'main' ? 'active' : ''}`}
            data-testid="nav-main-page"
            onClick={() => switchPage('main')}
          >
            الرئيسية: المطابقة والنتائج
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activePage === 'settings' ? 'active' : ''}`}
            data-testid="nav-settings-page"
            onClick={() => switchPage('settings')}
          >
            صفحة الإعدادات ⚙️
          </button>
        </nav>
      </header>

      <p className="notice" role="status" data-testid="status-banner">
        {statusMessage}
        {auditedAt ? ` | وقت التدقيق: ${auditedAt}` : ''}
      </p>

      {/* MAIN PAGE: Ultra-clean URL Input + Single Action Button + Results */}
      <div
        className={activePage === 'main' ? 'main-page-view is-active' : 'main-page-view is-docked'}
        data-testid="main-page-container"
      >
        <FigmaSourcePanel
          figmaUrl={figmaUrl}
          setFigmaUrl={setFigmaUrl}
          readerStatus={readerStatus}
          syncProgress={syncProgress}
          busy={busy}
          aiBusy={aiBusy}
          changeNote={changeNote}
          onUnifiedSendAndCompare={() => handleUnifiedSendAndCompare(false)}
          onLoginFigmaReader={handleLoginFigmaReader}
          onOpenFigmaAccount={handleOpenFigmaAccount}
          onOpenCurrentUrlInBrowser={handleOpenCurrentUrlInBrowser}
          onToggleAuthSession={handleToggleAuthSession}
          onRefreshAuthStatus={handleRefreshAuthStatus}
          onOpenSettingsPage={() => switchPage('settings')}
        />

        <ComparisonDashboardPanel
          comparison={comparison}
          genuineVisual={genuineVisual}
          visual={visual}
          refNode={ref}
          actual={actual}
          previewUrl={previewUrl}
          aiComparison={effectiveAiComparison}
          aiBusy={aiBusy}
          preferredAiModel={preferredAiModel}
          onRunGeminiCompare={() => handleRunGeminiCompare(ref, actual)}
          onRunVisualCompare={handleVisualCompare}
          onPrintReport={() => window.print()}
          onOpenSettingsPage={() => switchPage('settings')}
          reportHref={reportHref}
          busy={busy}
        />
      </div>

      {/* SEPARATE SETTINGS PAGE: Houses all advanced tools, diagnostics, Storybook, Explorer, and Reports */}
      <div
        className={activePage === 'settings' ? 'settings-page-view is-active' : 'settings-page-view is-docked'}
        data-testid="settings-page-container"
        aria-label="صفحة الإعدادات والأدوات المتقدمة"
      >
        <div className="panel settings-header-banner">
          <div className="panel-head" style={{ marginBottom: 0 }}>
            <div>
              <h2>⚙️ صفحة الإعدادات والأدوات المتقدمة (Settings &amp; Diagnostics)</h2>
              <span>
                تم نقل جميع أدوات الفحص الفرعية، وسيناريوهات Storybook، ومستكشف الشجرة، وإعدادات النماذج والتقارير إلى هذه الصفحة المنفصلة لتقليل الازدحام في الصفحة الرئيسية.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="back-to-main-page-btn"
              onClick={() => switchPage('main')}
            >
              العودة إلى صفحة المطابقة والنتائج ←
            </button>
          </div>
        </div>

        {/* Settings Card 1: Advanced URL & Local Source Controls + AI Model Selector */}
        <article className="panel" data-testid="settings-source-and-ai-card" style={{ margin: '18px 0' }}>
          <div className="panel-head">
            <div>
              <h2>1. إعدادات المصدر المحلي ونموذج الذكاء الاصطناعي والمقارنة البصرية</h2>
              <span>أدوات تحليل الرابط، واستيراد الملفات المحلية (.fig / .zip / .json)، واختيار نموذج Gemini</span>
            </div>
          </div>

          <div className="settings-actions-grid">
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="parse-url-btn"
              onClick={handleParseUrl}
              disabled={busy}
            >
              تحليل الرابط الحالي
            </button>
            <button
              type="button"
              className="btn btn-outline"
              data-testid="refresh-figma-btn"
              onClick={() => handleUnifiedSendAndCompare(true)}
              disabled={busy}
            >
              تحديث لقطة التصميم (--refresh)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="sync-local-fixture-btn"
              onClick={handleSyncLocalFixture}
              disabled={busy}
            >
              📦 مزامنة ملف .fig المرجعي عبر figma-reader
            </button>
            <label className="upload-button">
              📂 استيراد ملف محلي (.fig / .zip / .json)
              <input
                aria-label="استيراد JSON أو ZIP أو FIG"
                type="file"
                accept=".json,.zip,.fig,application/json,application/zip"
                onChange={handleImportLocalFile}
              />
            </label>
            <label className="settings-inline-label">
              نموذج Gemini AI:{' '}
              <select
                aria-label="نموذج Gemini AI"
                data-testid="gemini-model-select"
                value={preferredAiModel}
                onChange={e => setPreferredAiModel(e.target.value)}
                className="model-select"
                dir="ltr"
              >
                {GEMINI_MODEL_CASCADE.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleVisualCompare(false)}
              disabled={busy}
            >
              تشغيل المقارنة البصرية (Pixelmatch)
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleVisualCompare(true)}
              disabled={busy}
            >
              مقارنة بصرية تجريبية (--demo)
            </button>
          </div>

          {urlInfo && (
            <div className="diagnostic-box compact-box" data-testid="parsed-url-info">
              <strong>نتيجة تحليل الرابط:</strong> مفتاح الملف:{' '}
              <code dir="ltr">{urlInfo.fileKey}</code> | معرّف العقدة:{' '}
              <code dir="ltr">{urlInfo.nodeId || 'غير محدد'}</code> | البروتوكول:{' '}
              <code dir="ltr">{urlInfo.isHttpDev ? 'HTTP (Development Mode)' : 'HTTPS'}</code> | النوع:{' '}
              <code dir="ltr">{urlInfo.surface || 'design'}</code> | اسم الملف:{' '}
              <code dir="ltr">{urlInfo.fileName || '—'}</code>
            </div>
          )}

          <div className="diagnostic-box compact-box">
            <strong>إصدار التصميم والطابع الزمني:</strong>{' '}
            المصدر: <code dir="ltr">{ref?.source || '—'}</code> | الإصدار/التعديل:{' '}
            <code dir="ltr">{ref?.sourceVersion || ref?.fileModifiedAt || ref?.exportedAt || 'نسخة محلية'}</code>{' '}
            | وقت الاستحواذ: <code dir="ltr">{ref?.acquiredAt || '—'}</code>
          </div>
        </article>

        {/* Settings Card 2: Storybook Scenarios & Playwright DOM Inspector */}
        <ReactImplementationPanel
          actual={actual}
          setActual={setActual}
          selectedScenarioId={selectedScenarioId}
          onSelectScenario={handleSelectScenario}
          playwrightInspection={playwrightInspection}
          onRunPlaywrightInspection={handleRunPlaywrightInspection}
          onResetDemoMismatch={() => {
            setSelectedScenarioId('IncorrectWidth');
            setActual(demoActual(ref));
          }}
          onMakeExactMatch={() => {
            setSelectedScenarioId('ExactMatch');
            setActual(copiedActual(ref));
          }}
          busy={busy}
        />

        {/* Settings Card 3: Design Explorer & Parser Comparison */}
        <DesignExplorerPanel
          hierarchy={hierarchy}
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectExplorerNode}
          refNode={ref}
          parserComparison={parserComparison}
          onCompareParsers={handleCompareParsers}
          busy={busy}
        />

        {/* Settings Card 4: Reports & Technical Audit Logs */}
        <ReportsAuditPanel
          visual={visual}
          reportRecord={reportRecord}
          reportHref={reportHref}
          auditLogs={readerStatus?.auditLogs || []}
          onGenerateHtmlReport={handleGenerateHtmlReport}
          onDownloadJsonReport={handleDownloadJsonReport}
          onPrintPdfReport={() => window.print()}
          busy={busy}
        />
      </div>

      <footer>
        المصدر الحالي: <code dir="ltr">{ref.source}</code> | الأداة الأساسية: <code dir="ltr">@leogcode/figma-reader@0.4.2</code> | الذكاء الاصطناعي: <code dir="ltr">{preferredAiModel}</code>
      </footer>
    </div>
  );
}
