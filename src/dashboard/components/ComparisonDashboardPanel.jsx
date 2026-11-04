import React from 'react';
import { EXTENDED_FIELDS } from '../../lib/compare.mjs';

const pretty = (value, unit = '') =>
  value == null ? 'غير متاح' : `${typeof value === 'number' ? +Number(value).toFixed(2) : value}${unit || ''}`;

export function ComparisonDashboardPanel({
  comparison,
  genuineVisual,
  visual,
  refNode,
  onRunVisualCompare,
  onPrintReport,
  reportHref,
  busy,
}) {
  return (
    <section aria-label="لوحة المقارنة والأدلة (Comparison Dashboard)" data-testid="comparison-dashboard-section">
      <div className="metrics-grid" aria-label="مؤشرات المطابقة الثلاثة">
        <div className="metric-card">
          <span className="metric-card-title">1. درجة مطابقة الخصائص (Property Fidelity Score)</span>
          <span className="metric-card-value highlight" data-testid="score">
            {comparison.score ?? '—'}%
          </span>
          <span className="metric-card-sub">
            {comparison.passed} من {comparison.total} خاصية متاحة وقابلة للمقارنة مطابقة
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-card-title">2. درجة التشابه البصري (Visual Similarity Score)</span>
          <span className="metric-card-value visual" data-testid="visual-score">
            {genuineVisual == null ? 'غير متاح' : `${genuineVisual}%`}
          </span>
          <span className="metric-card-sub">
            {visual?.source === 'genuine-figma-image-user-supplied' && visual.pixelSimilarity != null
              ? `صورة وفّرها المستخدم: ${visual.pixelSimilarity}%`
              : visual?.source === 'synthetic-reference-rendered-from-json'
                ? `مرجع تجريبي (لا يُعتمد كتشابه أصيل: ${visual.pixelSimilarity ?? '—'}%)`
                : 'تُحسب فقط عند توفر لقطة مرجعية أصلية متطابقة الأبعاد عبر Pixelmatch'}
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-card-title">3. تغطية الفحص (Inspection Coverage)</span>
          <span className="metric-card-value" data-testid="coverage">
            {comparison.coverage.percentage}%
          </span>
          <span className="metric-card-sub">
            {comparison.coverage.tested} من أصل {EXTENDED_FIELDS.length} خاصية في الكتالوج المعياري متوفرة في المرجع
          </span>
        </div>
      </div>

      <article className="panel" id="diff-table" style={{ margin: '20px 0' }}>
        <div className="panel-head">
          <div>
            <h2>د. جدول فروقات الخصائص والأدلة والتوصيات</h2>
            <span>
              حالات المقارنة: MATCH ({comparison.statusCounts?.MATCH ?? 0}) | MISMATCH ({comparison.statusCounts?.MISMATCH ?? 0}) | NOT_AVAILABLE ({comparison.statusCounts?.NOT_AVAILABLE ?? 0}) | NOT_COMPARABLE ({comparison.statusCounts?.NOT_COMPARABLE ?? 0})
            </span>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={() => onRunVisualCompare(false)} disabled={busy}>
              تشغيل المقارنة البصرية (Pixelmatch + reg-cli)
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onRunVisualCompare(true)} disabled={busy}>
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
                <th>الشدة (Severity)</th>
                <th>الحالة (Status)</th>
                <th>الدليل (Evidence)</th>
                <th>التوصية للإصلاح (Recommended Fix)</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map(row => (
                <tr key={row.key} className={row.match ? 'ok' : 'bad'}>
                  <td>{row.elementName || refNode?.nodeName || 'DesignItem'}</td>
                  <td>
                    {row.label} <code dir="ltr">({row.key})</code>
                  </td>
                  <td dir="ltr">{pretty(row.expected, row.unit)}</td>
                  <td dir="ltr">{pretty(row.actual, row.unit)}</td>
                  <td dir="ltr">{row.difference || '—'}</td>
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

        <p className="small">
          <strong>معادلة مطابقة الخصائص:</strong> {comparison.formula}
        </p>
        <p className="small">
          <strong>خصائص غير متوفرة في المرجع الحالي (NOT_AVAILABLE):</strong>{' '}
          {EXTENDED_FIELDS.filter(field => refNode?.[field.key] == null)
            .map(field => field.label)
            .join('، ') || 'جميع خصائص الكتالوج متوفرة في هذا المرجع!'}
        </p>

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

