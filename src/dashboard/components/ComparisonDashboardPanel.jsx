import React, { useState } from 'react';
import { EXTENDED_FIELDS } from '../../lib/compare.mjs';
import { GEMINI_MODEL_CASCADE } from '../../comparison/ai-engine/gemini-comparison.mjs';

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
        style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }}
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

export function ComparisonDashboardPanel({
  comparison,
  genuineVisual,
  visual,
  refNode,
  aiComparison,
  aiBusy,
  preferredAiModel,
  setPreferredAiModel,
  onRunGeminiCompare,
  onRunVisualCompare,
  onPrintReport,
  reportHref,
  busy,
}) {
  const [rowFilter, setRowFilter] = useState('ALL');
  const [showMissingCatalog, setShowMissingCatalog] = useState(false);

  const activeCategories = (comparison.categoryScores || []).filter(cat => cat.total > 0);
  const filteredRows = (comparison.rows || []).filter(row => {
    if (rowFilter === 'MISMATCH') return !row.match;
    if (rowFilter === 'MATCH') return row.match;
    return true;
  });

  const exactPassRate = comparison.overallPercentages?.exactPassRate ?? 0;
  const mismatchRate = comparison.overallPercentages?.mismatchRate ?? 0;

  return (
    <section aria-label="لوحة المقارنة والأدلة (Comparison Dashboard)" data-testid="comparison-dashboard-section">
      {/* Top 4 Primary Percentage KPIs with Smooth Gauges */}
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
              color="#7c3aed"
            />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${comparison.continuousScore ?? comparison.score ?? 0}%`,
                background: '#7c3aed',
              }}
            />
          </div>
          <span className="metric-card-sub">
            تقيس مدى قرب الأبعاد والألوان والخطوط حتى عند وجود فروق طفيفة
          </span>
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
                ? `معاينة تجريبية: ${visual.pixelSimilarity ?? '—'}% (يتطلب PNG أصلي للاعتماد)`
                : 'تُحسب عند توفر لقطة مرجعية متطابقة الأبعاد عبر Pixelmatch'}
          </span>
        </div>

        <div className="metric-card">
          <div className="metric-card-top">
            <div>
              <span className="metric-card-title">4. تغطية الفحص الشاملة (Inspection Coverage)</span>
              <span className="metric-card-value" data-testid="coverage">
                {comparison.coverage.percentage}%
              </span>
            </div>
            <CircularGauge value={comparison.coverage.percentage} color="#0284c7" />
          </div>
          <div className="smooth-progress-track">
            <div
              className="smooth-progress-fill"
              style={{
                width: `${comparison.coverage.percentage ?? 0}%`,
                background: '#0284c7',
              }}
            />
          </div>
          <span className="metric-card-sub">
            {comparison.coverage.tested} من أصل {EXTENDED_FIELDS.length} خاصية معيارية متوفرة ومفحوصة
          </span>
        </div>
      </div>

      {/* Complete Category Percentage Breakdown */}
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

      {/* Gemini AI Latest Version Smart Comparison Panel */}
      <article
        className="panel gemini-ai-panel"
        data-testid="gemini-ai-comparison-panel"
        aria-label="المقارنة الذكية عبر Gemini AI"
      >
        <div className="panel-head">
          <div>
            <div className="gemini-badge-row">
              <span className="gemini-chip">✨ GEMINI AI LATEST</span>
              <span className="gemini-endpoint-code" dir="ltr">
                v1beta/models/{preferredAiModel || 'gemini-flash-latest'}:generateContent
              </span>
            </div>
            <h2>المقارنة الذكية الشاملة وتحليل الفروقات عبر Gemini Flash (أحدث إصدار)</h2>
            <span>
              تحليل دلالي وهندسي متكامل للنتائج مع توليد توصيات إصلاح الكود ومقتطف CSS جاهز للتطبيق
            </span>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <select
              aria-label="نموذج Gemini AI"
              data-testid="gemini-model-select"
              value={preferredAiModel}
              onChange={e => setPreferredAiModel?.(e.target.value)}
              className="model-select"
              dir="ltr"
            >
              {GEMINI_MODEL_CASCADE.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-gemini"
              data-testid="run-gemini-compare-btn"
              onClick={() => onRunGeminiCompare?.()}
              disabled={aiBusy || busy}
            >
              {aiBusy ? 'جارٍ التحليل عبر Gemini...' : '✨ مقارنة النتائج عبر Gemini AI'}
            </button>
          </div>
        </div>

        {aiComparison && (
          <div className="gemini-results-grid" data-testid="gemini-ai-results">
            <div className="gemini-score-box">
              <CircularGauge
                value={aiComparison.aiScore}
                color={getScoreColor(aiComparison.aiScore)}
                size={84}
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
              <strong>الملخص التنفيذي للمطابقة:</strong>
              <p data-testid="gemini-executive-summary">{aiComparison.executiveSummary}</p>
              <div className="gemini-lists-row">
                <div>
                  <strong>أبرز الفروقات المرصودة:</strong>
                  <ul>
                    {(aiComparison.keyDiscrepancies || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>توصيات الإصلاح الفورية:</strong>
                  <ul>
                    {(aiComparison.actionableFixes || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {aiComparison.cssPatchSuggestion && (
              <div className="gemini-css-patch">
                <strong>مقتطف CSS المقترح للمطابقة الكاملة 100%:</strong>
                <pre dir="ltr" data-testid="gemini-css-patch">
                  <code>{aiComparison.cssPatchSuggestion}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </article>

      {/* Detailed Property Comparison Table with Filter Tabs & Per-Row Accuracy Bar */}
      <article className="panel" id="diff-table" style={{ margin: '20px 0' }}>
        <div className="panel-head">
          <div>
            <h2>د. جدول المقارنة التفصيلية والنسب المئوية لكل خاصية</h2>
            <span>
              حالات المقارنة: MATCH ({comparison.statusCounts?.MATCH ?? 0}) | MISMATCH ({comparison.statusCounts?.MISMATCH ?? 0}) | NOT_AVAILABLE ({comparison.statusCounts?.NOT_AVAILABLE ?? 0}) | NOT_COMPARABLE ({comparison.statusCounts?.NOT_COMPARABLE ?? 0})
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
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRunVisualCompare(false)} disabled={busy}>
              تشغيل المقارنة البصرية (Pixelmatch)
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onRunVisualCompare(true)} disabled={busy}>
              مقارنة بصرية تجريبية (--demo)
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>العنصر (Element)</th>
                <th>الخاصية (Property)</th>
                <th>المتوقع (Figma)</th>
                <th>الفعلي (React)</th>
                <th>الفرق (Difference)</th>
                <th>نسبة الدقة (Accuracy %)</th>
                <th>الشدة (Severity)</th>
                <th>الحالة (Status)</th>
                <th>الدليل (Evidence)</th>
                <th>التوصية للإصلاح (Recommended Fix)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.key} className={row.match ? 'ok' : 'bad'}>
                  <td>{row.elementName || refNode?.nodeName || 'DesignItem'}</td>
                  <td>
                    {row.label} <code dir="ltr">({row.key})</code>
                  </td>
                  <td dir="ltr">{pretty(row.expected, row.unit)}</td>
                  <td dir="ltr">{pretty(row.actual, row.unit)}</td>
                  <td dir="ltr">{row.difference || '—'}</td>
                  <td>
                    <div className="row-accuracy-cell">
                      <span
                        className="row-accuracy-val"
                        style={{ color: getScoreColor(row.matchPercentage) }}
                      >
                        {row.matchPercentage ?? (row.match ? 100 : 0)}%
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
                  <td>
                    <span className={`sev-tag sev-${row.severity === 'medium' ? 'med' : row.severity}`}>
                      {row.severity === 'high'
                        ? 'عالية'
                        : row.severity === 'medium'
                          ? 'متوسطة'
                          : row.severity === 'low'
                            ? 'منخفضة'
                            : 'لا فرق'}
                    </span>
                  </td>
                  <td>{row.match ? 'مطابق (MATCH)' : 'مختلف (MISMATCH)'}</td>
                  <td style={{ fontSize: 11, color: '#475569' }}>{row.evidence}</td>
                  <td style={{ fontSize: 11 }}>{row.recommendation}</td>
                </tr>
              ))}
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

        <div className="actions">
          <button className="btn btn-secondary" onClick={onPrintReport}>
            طباعة / PDF
          </button>
          {reportHref ? (
            <a className="btn btn-outline" href={reportHref} target="_blank" rel="noreferrer">
              فتح تقرير HTML المحفوظ
            </a>
          ) : null}
        </div>
      </article>
    </section>
  );
}
