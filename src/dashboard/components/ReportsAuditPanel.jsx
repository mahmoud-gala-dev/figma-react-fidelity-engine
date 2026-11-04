import React from 'react';

export function ReportsAuditPanel({
  visual,
  reportRecord,
  reportHref,
  auditLogs,
  onGenerateHtmlReport,
  onDownloadJsonReport,
  onPrintPdfReport,
  busy,
}) {
  return (
    <section className="panel" aria-label="التقارير وسجل التدقيق التقني" data-testid="reports-audit-section" style={{ margin: '20px 0' }}>
      <div className="panel-head">
        <div>
          <h2>هـ. التقارير والاختلافات البصرية وسجل التدقيق التقني (Reports &amp; Audit Logs)</h2>
          <span>توليد تقارير HTML وPDF وJSON وربط مباشر بتقارير Pixelmatch وreg-cli</span>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="generate-report-btn"
            onClick={onGenerateHtmlReport}
            disabled={busy}
          >
            توليد وتنزيل تقرير HTML
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="print-pdf-report-btn"
            onClick={onPrintPdfReport}
          >
            طباعة / تصدير PDF
          </button>
          <button
            type="button"
            className="btn btn-outline"
            data-testid="download-json-report-btn"
            onClick={onDownloadJsonReport}
          >
            تنزيل تقرير JSON المقروء آليًا
          </button>
        </div>
      </div>

      {reportRecord && (
        <div className="diagnostic-box" data-testid="saved-report-links">
          <strong>التقرير المحفوظ على الخادم المحلي:</strong> المعرّف{' '}
          <code dir="ltr">{reportRecord.reportId}</code> —{' '}
          <a href={reportRecord.htmlUrl} target="_blank" rel="noreferrer">
            فتح تقرير HTML (<code dir="ltr">{reportRecord.htmlUrl}</code>)
          </a>{' '}
          |{' '}
          <a href={reportRecord.jsonUrl} target="_blank" rel="noreferrer">
            فتح ملف JSON (<code dir="ltr">{reportRecord.jsonUrl}</code>)
          </a>
        </div>
      )}

      <div className="preview-grid" style={{ marginTop: 14 }}>
        <div className="diagnostic-box" style={{ marginTop: 0 }}>
          <strong>روابط تقارير الانحدار البصري (Visual Regression &amp; reg-cli):</strong>
          <ul style={{ margin: '8px 0 0', paddingRight: 18 }}>
            <li>
              <a href="/api/reports/visual/reg-cli-report.html" target="_blank" rel="noreferrer">
                فتح تقرير <code dir="ltr">reg-cli</code> التفاعلي (<code dir="ltr">out/visual/reg-cli-report.html</code>)
              </a>
            </li>
            <li>
              <a href="/api/reports/visual/visual-report.html" target="_blank" rel="noreferrer">
                فتح التقرير البصري العربي (<code dir="ltr">out/visual/visual-report.html</code>)
              </a>
            </li>
            <li>
              <a href="/api/reports/visual/reg.json" target="_blank" rel="noreferrer">
                بيانات المقارنة المقروءة آليًا (<code dir="ltr">out/visual/reg.json</code>)
              </a>
            </li>
            {reportHref ? (
              <li>
                <a href={reportHref} target="_blank" rel="noreferrer">
                  تقرير العميل المحفوظ (<code dir="ltr">{reportHref}</code>)
                </a>
              </li>
            ) : null}
          </ul>
          {visual && (
            <div style={{ marginTop: 10 }}>
              <div>
                <strong>حالة Pixelmatch الأخيرة:</strong> المصدر <code dir="ltr">{visual.source}</code> | البكسلات المختلفة:{' '}
                <code dir="ltr">{visual.diffPixels ?? '—'}</code> | النسبة الأولية:{' '}
                <code dir="ltr">{visual.pixelSimilarity != null ? `${visual.pixelSimilarity}%` : 'غير متاحة'}</code>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <img
                  alt="لقطة React"
                  src="/api/reports/visual/actual/item.png"
                  style={{ maxHeight: 90, border: '1px solid #cbd5e1', borderRadius: 6 }}
                />
                {visual.diffPixels != null && (
                  <img
                    alt="فرق البكسل"
                    src="/api/reports/visual/diff/item.png"
                    style={{ maxHeight: 90, border: '1px solid #cbd5e1', borderRadius: 6 }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="diagnostic-box" style={{ marginTop: 0, maxHeight: 230, overflowY: 'auto' }} data-testid="technical-audit-logs">
          <strong>سجل التدقيق التقني (Technical Audit Logs — figma-reader &amp; API):</strong>
          {auditLogs && auditLogs.length > 0 ? (
            <ul style={{ margin: '8px 0 0', paddingRight: 18 }}>
              {auditLogs.map((log, idx) => (
                <li key={`${log.timestamp || idx}-${idx}`}>
                  <code dir="ltr">
                    [{log.timestamp}] cmd={log.command} exit={log.exitCode} ({log.durationMs}ms)
                  </code>{' '}
                  — {log.reason || 'ok'}
                  {log.stderr ? <span style={{ color: '#b91c1c' }}> ({log.stderr})</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '8px 0 0' }}>
              جميع أوامر <code dir="ltr">figma-reader</code> تُنفَّذ عبر <code dir="ltr">execFile</code> بمصفوفات وسائط آمنة وتُسجَّل هنا مع رموز الخروج والزمن المستغرق.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

