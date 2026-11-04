import React, { useEffect, useMemo, useState } from 'react';
import { compareSpecs, EXTENDED_FIELDS } from '../../lib/compare.mjs';
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
  loginFigmaReader,
  openFigmaBrowser,
  refreshFigmaDesign,
  runVisualComparisonApi,
  saveClientReport,
  saveReportApi,
  syncFigmaDesign,
} from '../../integrations/figma/figma-connector-client.mjs';
import { importFigmaExportZip, importJsonObject } from '../../lib/import-design.mjs';
import { buildClientReport, generateJsonReport } from '../../lib/client-report.mjs';
import { matchSelectedPair } from '../../lib/match-nodes.mjs';
import { getScenarioById } from '../../inspection/storybook/storybook-scenarios.mjs';
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
  const [syncProgress, setSyncProgress] = useState('جاهز للمزامنة المباشرة عبر figma-reader');
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

  useEffect(() => {
    let stop = false;
    fetchLastSync()
      .then(saved => {
        if (stop || !saved?.ref) throw new Error('empty');
        setRef(saved.ref);
        setActual(demoActual(saved.ref));
        setNodes(saved.index || []);
        setPreviewUrl(saved.previewUrl || '');
        if (saved.change?.summary) setChangeNote(saved.change.summary);
        setStatusMessage(`عُرضت آخر مزامنة محفوظة محليًا${saved.savedAt ? ` (${saved.savedAt})` : ''}.`);
      })
      .catch(() =>
        fetch('/reference.json', { cache: 'no-store' })
          .then(response => {
            if (!response.ok) throw new Error('reference.json غير متاح');
            return response.json();
          })
          .then(data => {
            if (stop) return;
            setRef(data);
            setActual(demoActual(data));
            setStatusMessage('تم تحميل المرجع الأولي. يمكنك المزامنة المباشرة عبر figma-reader من أي رابط Figma مصرح به.');
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
      fetchFigmaReaderStatus()
        .then(status => {
          if (!stop) setReaderStatus(status);
        })
        .catch(() => {
          if (!stop) {
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

  async function handleSyncFromFigma(refresh = false) {
    setBusy(true);
    setChangeNote('');
    setSyncProgress(
      refresh
        ? 'جارٍ تحديث لقطة التصميم من Figma عبر figma-reader (--refresh)...'
        : 'جارٍ التحقق من الرابط وجلب التصميم عبر figma-reader...'
    );
    try {
      const parsed = parseFigmaUrl(figmaUrl);
      setUrlInfo(parsed);
      const synced = refresh
        ? await refreshFigmaDesign({
            url: figmaUrl,
            nodeId: selectedNodeId || parsed.nodeId || null,
            allowDevFallback: true,
          })
        : await syncFigmaDesign({
            url: figmaUrl,
            refresh: false,
            nodeId: selectedNodeId || parsed.nodeId || null,
            openBrowserOnAuthRequired: false,
            allowDevFallback: true,
          });
      setRef(synced.ref);
      setActual(copiedActual(synced.ref));
      setSelectedScenarioId('ExactMatch');
      setSelectedNodeId(synced.selectedNodeId || '');
      if (synced.hierarchy) setHierarchy(synced.hierarchy);
      if (synced.index) setNodes(synced.index);
      if (synced.ref?.previewUrl) setPreviewUrl(synced.ref.previewUrl);
      if (synced.change?.summary) setChangeNote(synced.change.summary);
      setSyncProgress(`اكتملت المزامنة بنجاح (${synced.syncedAt})`);
      setStatusMessage(
        synced.usedDevFallback
          ? `تمت مزامنة العقدة ${synced.selectedNodeId} (${synced.ref?.nodeName}) عبر ${synced.adapter} في وضع التطوير المحلي فوراً — ويمكنك فتح المتصفح لتسجيل الدخول لحسابك السحابي متى شئت.`
          : `تمت مزامنة العقدة ${synced.selectedNodeId} (${synced.ref?.nodeName}) عبر ${synced.adapter}.`
      );
      fetchFigmaReaderStatus().then(setReaderStatus).catch(() => {});
    } catch (error) {
      setSyncProgress(`توقفت المزامنة: ${error.code || 'يتطلب إجراء'}`);
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
      setRef(synced.ref);
      setActual(copiedActual(synced.ref));
      setSelectedScenarioId('ExactMatch');
      setSelectedNodeId(synced.selectedNodeId || '942:2734');
      if (synced.hierarchy) setHierarchy(synced.hierarchy);
      if (synced.index) setNodes(synced.index);
      if (synced.change?.summary) setChangeNote(synced.change.summary);
      setSyncProgress(`تم استخراج وتطبيع التصميم عبر figma-reader (${synced.syncedAt})`);
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
    setSyncProgress(`جارٍ جلب خصائص العقدة ${nodeId} عبر figma-reader...`);
    try {
      const res = await fetchFigmaNode(nodeId);
      if (res?.ref) {
        setRef(res.ref);
        setActual(copiedActual(res.ref));
        setSelectedScenarioId('ExactMatch');
        if (res.change?.summary) setChangeNote(res.change.summary);
        setSyncProgress(`تم تحميل العقدة ${res.nodeId}`);
        setStatusMessage(`تم اختيار العقدة ${res.ref.nodeName} (${res.nodeId}) وتحديث جدول المقارنة.`);
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
        setRef(imported.ref);
        setActual(copiedActual(imported.ref));
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
        setRef(imported.ref);
        setActual(copiedActual(imported.ref));
        setNodes(imported.index || []);
        setPreviewUrl(imported.previewUrl || '');
        setStatusMessage(`تم استيراد حزمة ZIP القديمة (OPTIONAL / LEGACY): ${file.name}.`);
      } else if (name.endsWith('.json')) {
        const imported = importJsonObject(JSON.parse(await file.text()), {
          nodeId: parsed?.nodeId || null,
          fileName: file.name,
        });
        setRef(imported.ref);
        setActual(copiedActual(imported.ref));
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
      <header className="app-header">
        <div>
          <div className="eyebrow">7-TOOL ARCHITECTURE • PRIMARY: @LEOGCODE/FIGMA-READER • NO REST API</div>
          <h1>محرك مطابقة تصميم Figma مع مكوّنات React</h1>
          <p>
            معمارية محلية متكاملة تجمع بين <code dir="ltr">figma-reader</code> (أساسي)، و<code dir="ltr">OpenFig Core</code> (احتياطي)، و<code dir="ltr">Storybook</code>، و<code dir="ltr">Playwright</code>، و<code dir="ltr">Pixelmatch</code>، و<code dir="ltr">reg-cli</code> دون إرسال أي بيانات تصميم خارج الجهاز.
          </p>
        </div>
      </header>

      <FigmaSourcePanel
        figmaUrl={figmaUrl}
        setFigmaUrl={setFigmaUrl}
        urlInfo={urlInfo}
        readerStatus={readerStatus}
        syncProgress={syncProgress}
        busy={busy}
        refNode={ref}
        changeNote={changeNote}
        onParseUrl={handleParseUrl}
        onSyncFromFigma={handleSyncFromFigma}
        onRefreshDesign={() => handleSyncFromFigma(true)}
        onLoginFigmaReader={handleLoginFigmaReader}
        onOpenFigmaAccount={handleOpenFigmaAccount}
        onOpenCurrentUrlInBrowser={handleOpenCurrentUrlInBrowser}
        onSyncLocalFixture={handleSyncLocalFixture}
        onImportLocalFile={handleImportLocalFile}
      />

      <p className="notice" role="status" data-testid="status-banner">
        {statusMessage}
        {auditedAt ? ` | وقت التدقيق: ${auditedAt}` : ''}
      </p>

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

      <ReactImplementationPanel
        refNode={ref}
        actual={actual}
        setActual={setActual}
        previewUrl={previewUrl}
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

      <ComparisonDashboardPanel
        comparison={comparison}
        genuineVisual={genuineVisual}
        visual={visual}
        refNode={ref}
        onRunVisualCompare={handleVisualCompare}
        onPrintReport={() => window.print()}
        reportHref={reportHref}
        busy={busy}
      />

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

      <footer>
        المصدر الحالي: <code dir="ltr">{ref.source}</code> | الأداة الأساسية: <code dir="ltr">@leogcode/figma-reader@0.4.2</code> | Storybook على المنفذ 6006 | معالجة محلية 100% على <code dir="ltr">127.0.0.1</code>
      </footer>
    </div>
  );
}

