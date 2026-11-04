import React, { useState } from 'react';
import { EXTENDED_FIELDS } from '../../lib/compare.mjs';
import { buildFigmaDesignImageDataUrl } from '../../lib/figma-image-generator.mjs';
import { DesignItem } from '../../components/DesignItem.jsx';
import { MarkdownRenderer } from '../../components/MarkdownRenderer.jsx';

const pretty = (value, unit = '') =>
  value == null ? 'غير متاح' : `${typeof value === 'number' ? +Number(value).toFixed(2) : value}${unit || ''}`;

function CircularGauge({ value, color = '#2563eb', size = 68, strokeWidth = 6 }) {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (num / 100) * circumference;

  return (
    <svg width={size} height={size} className="circular-gauge" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.2s ease-out' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="12"
        fontWeight="800"
        fill="#0f172a"
      >
        {value == null ? '—' : `${Math.round(num)}%`}
      </text>
    </svg>
  );
}

function getScoreColor(pct) {
  if (pct == null) return '#94a3b8';
  if (pct >= 95) return '#059669';
  if (pct >= 75) return '#2563eb';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

function ColorSwatchValue({ value, unit = '' }) {
  const text = pretty(value, unit);
  const isHex = typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim());
  if (!isHex) return <span dir="ltr">{text}</span>;
  return (
    <span className="color-value-chip" dir="ltr">
      <span className="color-dot" style={{ backgroundColor: value }} aria-hidden="true" />
      <code>{value.toUpperCase()}</code>
    </span>
  );
}

export function ComparisonDashboardPanel({
  comparison,
  genuineVisual,
  visual,
  refNode,
  actual,
  previewUrl,
  aiComparison,
  aiBusy,
  preferredAiModel,
  onRunGeminiCompare,
  onRunVisualCompare,
  onPrintReport,
  onOpenSettingsPage,
  reportHref,
  busy,
}) {
  const [rowFilter, setRowFilter] = useState('ALL');
  const [showMissingCatalog, setShowMissingCatalog] = useState(false);
  const [markdownViewMode, setMarkdownViewMode] = useState('rendered');
  const [copiedMd, setCopiedMd] = useState(false);

  const activeCategories = (comparison.categoryScores || []).filter(cat => cat.total > 0);
  const filteredRows = (comparison.rows || []).filter(row => {
    if (rowFilter === 'MISMATCH') return !row.match;
    if (rowFilter === 'MATCH') return row.match;
    return true;
  });

  const exactPassRate = comparison.overallPercentages?.exactPassRate ?? 0;
  const mismatchRate = comparison.overallPercentages?.mismatchRate ?? 0;
  const effectiveFigmaImageUrl =
    refNode?.previewUrl || refNode?.figmaImageUrl || previewUrl || buildFigmaDesignImageDataUrl(refNode);

  const percentageReasons = aiComparison?.percentageReasons || {};

  return (
    <section aria-label="لوحة المقارنة والأدلة (Comparison Dashboard)" data-testid="comparison-dashboard-section">
      {/* 1. Figma Design Image vs Current Design Preview */}
      <div className="preview-grid" data-testid="visual-design-comparison-grid">
        <article className="panel" data-testid="figma-design-image-card">
          <div className="panel-head">
            <div>
              <h2>صورة تصميم فيجما المستخرجة (Figma Design Image)</h2>
              <span data-testid="figma-image-extraction-status">
                {busy
                  ? '⏳ جارٍ جلب واستخراج صورة التصميم من الرابط...'
                  : `${refNode?.fileName || refNode?.sourceName || 'Figma Design'} (${refNode?.fileKey || 'local'}) • العقدة: `}
                {!busy && (
                  <>
                    <code dir="ltr">{refNode?.nodeId || '942:2734'}</code> ({refNode?.nodeName || 'DesignItem'})
                  </>
                )}
              </span>
            </div>
            <a
              className="btn btn-outline btn-sm"
              href={effectiveFigmaImageUrl}
              download={`figma-node-${String(refNode?.nodeId || '942-2734').replace(/:/g, '-')}.svg`}
              data-testid="download-figma-image-btn"
            >
              تنزيل صورة فيجما
            </a>
          </div>
          <div className="stage stage-compare" data-testid="reference-canvas">
            <img
              key={`${refNode?.fileKey || 'local'}:${refNode?.nodeId || '942:2734'}:${refNode?.syncedAt || ''}`}
              alt={`صورة تصميم فيجما: ${refNode?.nodeName || 'DesignItem'}`}
              data-testid="figma-design-image"
              data-node-id={refNode?.nodeId || '942:2734'}
              data-file-key={refNode?.fileKey || 'vMYpz8Jc3EzVUsLQCDx3Jd'}
              src={effectiveFigmaImageUrl}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                opacity: busy ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            />
          </div>
          <div className="design-summary-strip" data-testid="figma-design-summary-strip">
            <span>
              <strong>الأبعاد في فيجما:</strong>{' '}
              <code dir="ltr">
                {refNode?.width ?? '—'}×{refNode?.height ?? '—'}px
              </code>
            </span>
            <span>
              <strong>الخلفية:</strong> <ColorSwatchValue value={refNode?.backgroundColor} />
            </span>
            <span>
              <strong>الاستدارة:</strong> <code dir="ltr">{refNode?.borderRadius ?? 0}px</code>
            </span>
            <span>
              <strong>النص:</strong> <strong>{refNode?.text || refNode?.nodeName || '—'}</strong>
            </span>
          </div>
        </article>

        <article className="panel" data-testid="current-design-preview-card">
          <div className="panel-head">
            <div>
              <h2>معاينة التصميم الحالي (Current Design — React)</h2>
              <span>المكوّن الفعلي قيد المقارنة والمطابقة</span>
            </div>
            {onOpenSettingsPage && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onOpenSettingsPage}
              >
                تعديل التصميم في الإعدادات ⚙️
              </button>
            )}
          </div>
          <div className="stage stage-compare" data-testid="actual-canvas">
            <DesignItem spec={actual} testId="react-item" />
          </div>
          <div className="design-summary-strip" data-testid="current-design-summary-strip">
            <span>
              <strong>الأبعاد الحالية:</strong>{' '}
              <code dir="ltr">
                {actual?.width ?? '—'}×{actual?.height ?? '—'}px
              </code>
            </span>
            <span>
              <strong>الخلفية:</strong> <ColorSwatchValue value={actual?.backgroundColor} />
            </span>
            <span>
              <strong>الاستدارة:</strong> <code dir="ltr">{actual?.borderRadius ?? 0}px</code>
            </span>
            <span>
              <strong>النص:</strong> <strong>{actual?.text || '—'}</strong>
            </span>
          </div>
        </article>
      </div>

      {/* 2. Top 4 Primary Percentage KPIs with Smooth Gauges & AI Reasons */}
      <div className="metrics-grid metrics-grid-4" aria-label="مؤشرات المطابقة والنسب المئوية الكاملة">
        <div className="metric-card">
          <div className="metric-card-top">
            <div>
              <span className="metric-card-title">1. مطابقة الخصائص الموزونة (Property Fidelity)</span>
              <span className="metric-card-value highlight" data-testid="score">
                {comparison.score ?? '—'}%
              </span>
            </div>
            <CircularGauge value={comparison.score} color={getScoreColor(comparison.score)} />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${comparison.score ?? 0}%`,
                background: getScoreColor(comparison.score),
              }}
            />
          </div>
          <span className="metric-card-sub">
            {comparison.passed} من {comparison.total} خاصية مطابقة ({exactPassRate}% نجاح | {mismatchRate}% اختلاف)
          </span>
          {percentageReasons.propertyFidelity && (
            <p className="metric-ai-reason" data-testid="reason-property-fidelity">
              <strong>سبب النسبة:</strong> {percentageReasons.propertyFidelity}
            </p>
          )}
        </div>

        <div className="metric-card">
          <div className="metric-card-top">
            <div>
              <span className="metric-card-title">2. نسبة التقارب الدقيق (Continuous Proximity)</span>
              <span className="metric-card-value proximity" data-testid="continuous-score">
                {comparison.continuousScore ?? comparison.score ?? '—'}%
              </span>
            </div>
            <CircularGauge
              value={comparison.continuousScore ?? comparison.score}
              color="#0284c7"
            />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${comparison.continuousScore ?? comparison.score ?? 0}%`,
                background: '#0284c7',
              }}
            />
          </div>
          <span className="metric-card-sub">
            تقيس مدى قرب الأبعاد والألوان والخطوط حتى عند وجود فروق طفيفة
          </span>
          {percentageReasons.continuousProximity && (
            <p className="metric-ai-reason" data-testid="reason-continuous-proximity">
              <strong>سبب النسبة:</strong> {percentageReasons.continuousProximity}
            </p>
          )}
        </div>

        <div className="metric-card">
          <div className="metric-card-top">
            <div>
              <span className="metric-card-title">3. درجة التشابه البصري (Visual Similarity)</span>
              <span className="metric-card-value visual" data-testid="visual-score">
                {genuineVisual == null ? 'غير متاح' : `${genuineVisual}%`}
              </span>
            </div>
            <CircularGauge
              value={genuineVisual ?? visual?.pixelSimilarity ?? null}
              color="#0d9488"
            />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${genuineVisual ?? visual?.pixelSimilarity ?? 0}%`,
                background: '#0d9488',
              }}
            />
          </div>
          <span className="metric-card-sub">
            {visual?.source === 'genuine-figma-image-user-supplied' && visual.pixelSimilarity != null
              ? `صورة مرجعية أصلية: ${visual.pixelSimilarity}%`
              : visual?.source === 'synthetic-reference-rendered-from-json'
                ? `معاينة تجريبية: ${visual.pixelSimilarity ?? '—'}%`
                : 'تُحسب عند تشغيل فحص Pixelmatch للقطات المتطابقة'}
          </span>
          {percentageReasons.visualSimilarity && (
            <p className="metric-ai-reason" data-testid="reason-visual-similarity">
              <strong>سبب النسبة:</strong> {percentageReasons.visualSimilarity}
            </p>
          )}
        </div>

        <div className="metric-card">
          <div className="metric-card-top">
            <div>
              <span className="metric-card-title">4. تغطية الفحص الشاملة (Inspection Coverage)</span>
              <span className="metric-card-value" data-testid="coverage">
                {comparison.coverage.percentage}%
              </span>
            </div>
            <CircularGauge value={comparison.coverage.percentage} color="#059669" />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${comparison.coverage.percentage ?? 0}%`,
                background: '#059669',
              }}
            />
          </div>
          <span className="metric-card-sub">
            {comparison.coverage.tested} من أصل {EXTENDED_FIELDS.length} خاصية معيارية متوفرة ومفحوصة
          </span>
          {percentageReasons.inspectionCoverage && (
            <p className="metric-ai-reason" data-testid="reason-inspection-coverage">
              <strong>سبب النسبة:</strong> {percentageReasons.inspectionCoverage}
            </p>
          )}
        </div>
      </div>

      {/* 3. Complete Category Percentage Breakdown */}
      <article className="panel category-breakdown-panel" data-testid="category-percentages-grid">
        <div className="panel-head">
          <div>
            <h2>تحليل النسب المئوية الكاملة حسب الفئات الهندسية والبصرية (Category Breakdown)</h2>
            <span>تفصيل دقيق لنسب التطابق الصارم والتقارب المستمر لكل فئة من فئات التصميم</span>
          </div>
        </div>
        <div className="category-cards-grid">
          {activeCategories.map(cat => (
            <div key={cat.id} className="category-stat-card" data-testid={`category-card-${cat.id}`}>
              <div className="category-stat-head">
                <span className="category-stat-name">
                  <span aria-hidden="true">{cat.icon}</span> {cat.label}
                </span>
                <span
                  className="category-stat-pct"
                  style={{ color: getScoreColor(cat.score) }}
                >
                  {cat.score ?? 0}%
                </span>
              </div>
              <div className="smooth-progress-track">
                <div
                  className="smooth-progress-fill"
                  style={{
                    width: `${cat.score ?? 0}%`,
                    background: getScoreColor(cat.score),
                  }}
                />
              </div>
              <div className="category-stat-meta">
                <span>
                  مطابق: <strong>{cat.passed}/{cat.total}</strong>
                </span>
                <span>
                  التقارب: <strong>{cat.continuousScore ?? cat.score ?? 0}%</strong>
                </span>
                <span>
                  الوزن: <strong>{cat.weightShare}%</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </article>

      {/* 4. Table of Current Design Data vs Figma Design Data with AI Reasons */}
      <article className="panel" id="diff-table" data-testid="current-vs-figma-table-panel" style={{ margin: '18px 0' }}>
        <div className="panel-head">
          <div>
            <h2>جدول بيانات التصميم الحالي وبيانات تصميم فيجما وتوضيح أسباب النسب</h2>
            <span>
              المتطابق: {comparison.statusCounts?.MATCH ?? 0} | المختلف: {comparison.statusCounts?.MISMATCH ?? 0} | غير المتاح في المرجع: {comparison.statusCounts?.NOT_AVAILABLE ?? 0}
            </span>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <div className="filter-pills" role="group" aria-label="تصفية خصائص الجدول">
              <button
                type="button"
                className={`filter-pill ${rowFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setRowFilter('ALL')}
              >
                الكل ({comparison.rows.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${rowFilter === 'MISMATCH' ? 'active' : ''}`}
                onClick={() => setRowFilter('MISMATCH')}
              >
                المختلف فقط ({comparison.statusCounts?.MISMATCH ?? 0})
              </button>
              <button
                type="button"
                className={`filter-pill ${rowFilter === 'MATCH' ? 'active' : ''}`}
                onClick={() => setRowFilter('MATCH')}
              >
                المطابق ({comparison.statusCounts?.MATCH ?? 0})
              </button>
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table data-testid="current-vs-figma-table">
            <thead>
              <tr>
                <th>العنصر (Element)</th>
                <th>الخاصية (Property)</th>
                <th>بيانات تصميم فيجما (Figma Data)</th>
                <th>بيانات التصميم الحالي (Current Data)</th>
                <th>الفرق (Difference)</th>
                <th>النسبة المئوية والوزن</th>
                <th>توضيح سبب النسبة بالذكاء الاصطناعي (AI Reason)</th>
                <th>الحالة</th>
                <th>التوصية للإصلاح</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const rowAiReason =
                  percentageReasons.rowReasons?.[row.key] ||
                  row.percentageReason ||
                  row.evidence;
                return (
                  <tr key={row.key} className={row.match ? 'ok' : 'bad'}>
                    <td>{row.elementName || refNode?.nodeName || 'DesignItem'}</td>
                    <td>
                      <strong>{row.label}</strong> <code dir="ltr">({row.key})</code>
                    </td>
                    <td dir="ltr">
                      <ColorSwatchValue value={row.expected} unit={row.unit} />
                    </td>
                    <td dir="ltr">
                      <ColorSwatchValue value={row.actual} unit={row.unit} />
                    </td>
                    <td dir="ltr">{row.difference || '—'}</td>
                    <td>
                      <div className="row-accuracy-cell">
                        <span
                          className="row-accuracy-val"
                          style={{ color: getScoreColor(row.matchPercentage) }}
                        >
                          {row.matchPercentage ?? (row.match ? 100 : 0)}%{' '}
                          <small style={{ color: '#64748b', fontWeight: 500 }}>
                            (وزن {row.weightShare ?? row.weight}%)
                          </small>
                        </span>
                        <div className="mini-progress-track">
                          <div
                            className="mini-progress-fill"
                            style={{
                              width: `${row.matchPercentage ?? (row.match ? 100 : 0)}%`,
                              background: getScoreColor(row.matchPercentage),
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.55 }}>
                      {rowAiReason}
                    </td>
                    <td>
                      <span className={`sev-tag ${row.match ? 'sev-none' : 'sev-high'}`}>
                        {row.match ? 'مطابق (MATCH)' : 'مختلف (MISMATCH)'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11.5 }}>{row.recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-footer-bar">
          <p className="small" style={{ margin: 0 }}>
            <strong>معادلة مطابقة الخصائص:</strong> {comparison.formula}
          </p>
          <button
            type="button"
            className="btn-link-toggle"
            onClick={() => setShowMissingCatalog(v => !v)}
          >
            {showMissingCatalog
              ? 'إخفاء الحقول غير المتوفرة في المرجع ▲'
              : `عرض الحقول غير المتوفرة في المرجع (${comparison.statusCounts?.NOT_AVAILABLE ?? 0}) ▼`}
          </button>
        </div>

        {showMissingCatalog && (
          <p className="small" style={{ marginTop: 8 }}>
            <strong>خصائص غير متوفرة في المرجع الحالي (NOT_AVAILABLE):</strong>{' '}
            {EXTENDED_FIELDS.filter(field => refNode?.[field.key] == null)
              .map(field => field.label)
              .join('، ') || 'جميع خصائص الكتالوج متوفرة في هذا المرجع!'}
          </p>
        )}
      </article>

      {/* 5. Gemini AI Full Markdown Explanation of Differences & Percentage Reasons */}
      <article
        className="panel gemini-ai-panel"
        data-testid="gemini-ai-comparison-panel"
        aria-label="توضيح أسباب النسب والاختلافات بواسطة الذكاء الاصطناعي ودعم المارك داون الكامل"
      >
        <div className="panel-head">
          <div>
            <div className="gemini-badge-row">
              <span className="gemini-chip">✨ GEMINI AI • MARKDOWN REPORT</span>
              <span className="gemini-endpoint-code" dir="ltr">
                v1beta/models/{preferredAiModel || 'gemini-flash-latest'}:generateContent
              </span>
            </div>
            <h2>توضيح أسباب النسب المئوية والاختلافات بواسطة الذكاء الاصطناعي (دعم كامل لـ Markdown)</h2>
            <span>
              تحليل مفصل لأسباب كل نسبة مئوية وجدول الاختلافات وكود المعالجة عبر {preferredAiModel || 'gemini-flash-latest'}
            </span>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="toggle-markdown-mode-btn"
              onClick={() => setMarkdownViewMode(m => (m === 'rendered' ? 'raw' : 'rendered'))}
            >
              {markdownViewMode === 'rendered' ? 'عرض كود Markdown الخام' : 'عرض Markdown المنسق'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              data-testid="copy-markdown-btn"
              onClick={() => {
                if (aiComparison?.markdownReport && typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(aiComparison.markdownReport).catch(() => {});
                }
                setCopiedMd(true);
                setTimeout(() => setCopiedMd(false), 1500);
              }}
            >
              {copiedMd ? '✓ تم نسخ Markdown' : 'نسخ تقرير Markdown'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="run-gemini-compare-btn"
              onClick={() => onRunGeminiCompare?.()}
              disabled={aiBusy || busy}
            >
              {aiBusy ? 'جارٍ التحليل عبر Gemini...' : '✨ تحديث التحليل الذكي'}
            </button>
          </div>
        </div>

        {aiComparison && (
          <div className="gemini-results-container" data-testid="gemini-ai-results">
            <div className="gemini-top-summary-row">
              <div className="gemini-score-box">
                <CircularGauge
                  value={aiComparison.aiScore}
                  color={getScoreColor(aiComparison.aiScore)}
                  size={80}
                  strokeWidth={7}
                />
                <div>
                  <div className="gemini-score-label">الدرجة الذكية الشاملة (AI Score)</div>
                  <div className="gemini-score-number" data-testid="gemini-ai-score">
                    {aiComparison.aiScore}%
                  </div>
                  <span className="gemini-verdict-pill" data-testid="gemini-ai-verdict">
                    {aiComparison.verdict}
                  </span>
                  <div className="gemini-model-meta" dir="ltr">
                    Model: {aiComparison.usedModel} ({aiComparison.latencyMs ?? 0}ms)
                  </div>
                </div>
              </div>

              <div className="gemini-summary-box">
                <strong>الملخص التنفيذي وتفسير النسب:</strong>
                <p data-testid="gemini-executive-summary">{aiComparison.executiveSummary}</p>
                {percentageReasons.aiScore && (
                  <p className="small" style={{ margin: 0 }}>
                    <strong>تفسير الدرجة الذكية:</strong> {percentageReasons.aiScore}
                  </p>
                )}
              </div>
            </div>

            {/* Full Markdown Report View */}
            {aiComparison.markdownReport && (
              <div className="gemini-markdown-box" data-testid="gemini-markdown-report">
                {markdownViewMode === 'raw' ? (
                  <pre className="markdown-raw-source" data-testid="gemini-markdown-raw">
                    <code>{aiComparison.markdownReport}</code>
                  </pre>
                ) : (
                  <MarkdownRenderer
                    content={aiComparison.markdownReport}
                    testId="gemini-markdown-rendered"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  );
}
