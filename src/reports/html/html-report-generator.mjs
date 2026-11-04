function esc(value) {
  return String(value ?? '—').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

/**
 * Generates a self-contained Arabic RTL HTML Fidelity & Evidence Report with LTR technical identifiers.
 * Suitable for both browser viewing and Print-to-PDF export.
 */
export function generateHtmlReport({
  reportId = `rep-${Date.now()}`,
  generatedAt = new Date().toISOString(),
  connection = {},
  reference = {},
  actual = {},
  fidelity = {},
  visual = {},
  matching = {},
  auditLogs = [],
} = {}) {
  const rowsHtml = (fidelity?.rows || [])
    .map(
      row => `
      <tr class="${row.match ? 'row-ok' : 'row-bad'}">
        <td>${esc(row.elementName || reference?.nodeName || 'DesignItem')}</td>
        <td><strong>${esc(row.label)}</strong> <code dir="ltr">(${esc(row.property || row.key)})</code></td>
        <td dir="ltr">${esc(row.expected)}${row.expected != null ? esc(row.unit || '') : ''}</td>
        <td dir="ltr">${esc(row.actual)}${row.actual != null ? esc(row.unit || '') : ''}</td>
        <td dir="ltr">${esc(row.difference ?? row.gap ?? '—')}</td>
        <td>${esc(row.severity)}</td>
        <td><span class="status-badge status-${esc(row.status || (row.match ? 'MATCH' : 'MISMATCH'))}">${esc(row.status || (row.match ? 'MATCH' : 'MISMATCH'))}</span></td>
        <td>${esc(row.evidence || row.impact || '')}</td>
        <td>${esc(row.recommendation || '')}</td>
      </tr>`
    )
    .join('');

  const missingHtml =
    (fidelity?.missing || [])
      .map(item => `<li><strong>${esc(item.label)}</strong> <code dir="ltr">(${esc(item.key || '')})</code>: ${esc(item.reason)}</li>`)
      .join('') || '<li>لا توجد خصائص غائبة داخل الكتالوج المعياري.</li>';

  const logsHtml =
    (auditLogs || [])
      .map(
        entry =>
          `<li><code dir="ltr">[${esc(entry.timestamp || '')}] ${esc(entry.command || entry.action || 'event')} (exit=${esc(entry.exitCode ?? 0)}, ${esc(entry.durationMs ?? 0)}ms)</code> — ${esc(entry.reason || entry.note || 'ok')}</li>`
      )
      .join('') || '<li>لا توجد سجلات أوامر إضافية.</li>';

  const visualText =
    fidelity?.genuineVisualSimilarity == null
      ? 'غير متاح (لا توجد لقطة مرجعية أصلية متطابقة الأبعاد)'
      : `${fidelity.genuineVisualSimilarity}%`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>تقرير مطابقة التصميم (Figma Fidelity Report) — ${esc(reportId)}</title>
  <style>
    body { font: 15px Tahoma, Arial, sans-serif; margin: 32px auto; max-width: 1120px; color: #172033; background: #fbfcfe; line-height: 1.65; }
    header { background: linear-gradient(135deg, #162f59, #1d4b8f); color: #fff; padding: 24px 28px; border-radius: 14px; margin-bottom: 22px; }
    header h1 { margin: 0 0 8px; font-size: 24px; }
    header p { margin: 4px 0; opacity: 0.92; font-size: 13px; }
    h2 { color: #1d3f86; border-bottom: 2px solid #e3eaf6; padding-bottom: 6px; margin-top: 28px; }
    table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; }
    td, th { border: 1px solid #d5deec; padding: 9px 10px; text-align: right; font-size: 13px; vertical-align: top; }
    th { background: #f0f4fb; color: #162f59; font-weight: bold; }
    .row-ok { background: #f6fef9; }
    .row-bad { background: #fff6f6; }
    code { direction: ltr; unicode-bidi: isolate; background: rgba(15, 23, 42, 0.07); padding: 2px 6px; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 18px 0; }
    .card { background: #fff; border: 1px solid #d5deec; padding: 16px; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); }
    .card b { display: block; color: #475569; font-size: 13px; margin-bottom: 6px; }
    .card .metric-val { font-size: 28px; font-weight: bold; color: #162f59; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: bold; direction: ltr; }
    .status-MATCH { background: #dcfce7; color: #15803d; }
    .status-MISMATCH { background: #fee2e2; color: #b91c1c; }
    .status-NOT_AVAILABLE, .status-NOT_COMPARABLE { background: #f1f5f9; color: #475569; }
    @media print {
      body { margin: 10px; background: #fff; }
      header { background: #162f59 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <header>
    <h1>تقرير مطابقة التصميم والأدلة البرمجية (Figma Fidelity Engine)</h1>
    <p>معرّف التقرير: <code dir="ltr">${esc(reportId)}</code> | وقت التدقيق: <code dir="ltr">${esc(generatedAt)}</code></p>
    <p>حالة الموصّل الأساسي (figma-reader): ${esc(connection?.state || 'غير محدد')} — ${esc(connection?.message || '')}</p>
    <p>مصدر Figma: ${esc(reference?.sourceName)} | مفتاح الملف: <code dir="ltr">${esc(reference?.fileKey || 'محلي')}</code> | العقدة: <code dir="ltr">${esc(reference?.nodeId)}</code> | الأداة: <code dir="ltr">${esc(reference?.source)}</code></p>
  </header>

  <div class="cards">
    <div class="card">
      <b>1. درجة مطابقة الخصائص (Property Fidelity Score)</b>
      <div class="metric-val">${fidelity?.propertyFidelity ?? 'غير متاح'}%</div>
      <small>تُحسب فقط من الخصائص المدعومة والمتاحة في المرجع</small>
    </div>
    <div class="card">
      <b>2. درجة التشابه البصري (Visual Similarity Score)</b>
      <div class="metric-val">${visualText}</div>
      <small>المصدر: ${esc(fidelity?.visualSource || visual?.source || 'غير متوفر')}</small>
    </div>
    <div class="card">
      <b>3. تغطية الفحص (Inspection Coverage)</b>
      <div class="metric-val">${fidelity?.inspectionCoverage ?? 'غير متاح'}%</div>
      <small>${esc(fidelity?.inspected)} من أصل ${esc(fidelity?.catalogSize)} خاصية معيارية</small>
    </div>
  </div>

  <p><strong>معادلة الخصائص:</strong> ${esc(fidelity?.formula)}</p>
  <p><strong>معادلة البكسلات:</strong> ${esc(fidelity?.visualFormula)}</p>

  <h2>جدول الفروقات والأدلة والتوصيات</h2>
  <table>
    <thead>
      <tr>
        <th>اسم العنصر</th>
        <th>الخاصية</th>
        <th>المتوقع (Figma)</th>
        <th>الفعلي (React)</th>
        <th>الفرق</th>
        <th>الشدة</th>
        <th>الحالة</th>
        <th>الدليل</th>
        <th>التوصية للإصلاح</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <h2>خصائص غير متاحة في المرجع (NOT_AVAILABLE)</h2>
  <ul>${missingHtml}</ul>

  <h2>سجل مطابقة العقد (Node Matching)</h2>
  <ul>${(matching?.log || []).map(line => `<li>${esc(line)}</li>`).join('') || '<li>مطابقة مباشرة للعقدة المحددة.</li>'}</ul>

  <h2>ملاحظات المقارنة البصرية (Pixelmatch &amp; reg-cli)</h2>
  <p>${(visual?.notes || []).map(esc).join(' — ') || 'لا توجد ملاحظات بصرية إضافية.'}</p>

  <h2>سجل التدقيق التقني (Technical Audit Logs)</h2>
  <ul>${logsHtml}</ul>
</body>
</html>`;
}

export function generateJsonReport(payload = {}) {
  return JSON.stringify(
    {
      schemaVersion: '2.0.0',
      generatedAt: payload.generatedAt || new Date().toISOString(),
      reportId: payload.reportId || `rep-${Date.now()}`,
      reference: payload.reference || null,
      actual: payload.actual || null,
      fidelity: payload.fidelity || null,
      visual: payload.visual || null,
      matching: payload.matching || null,
      auditLogs: payload.auditLogs || [],
    },
    null,
    2
  );
}

