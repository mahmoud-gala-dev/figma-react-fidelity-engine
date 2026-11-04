import React from 'react';

const STATE_LABEL = {
  disconnected: 'غير متصل',
  connector_requires_setup: 'الموصّل يحتاج إعدادًا',
  connected: 'متصل',
  synchronizing: 'جارٍ المزامنة',
  synchronized: 'تمت المزامنة',
  design_changed: 'تغيّر التصميم',
  permission_denied: 'الصلاحية مرفوضة',
  unsupported_document: 'نوع مستند غير مدعوم',
  sync_failed: 'فشلت المزامنة',
};

export function ConnectorPanel({
  figmaLink, setFigmaLink, linkInfo, connection, pairing, nodes, selectedNodeId, setSelectedNodeId,
  busy, onCheck, onSync, onRefresh, onImport, onCompare, onVisual, onReport,
}) {
  const state = connection?.state || 'connector_requires_setup';
  return <section className="figma-link-panel" aria-label="مزامنة Figma المحلية">
    <div className="figma-link-heading">
      <div>
        <strong>رابط تصميم Figma</strong>
        <p>الرابط يحدد الملف والعقدة فقط. السحب يتم عبر إضافة Figma المفتوحة على هذا الجهاز، لا عبر REST API.</p>
      </div>
      <span className={`state-pill state-${state}`} data-testid="connection-state">{STATE_LABEL[state] || state}</span>
    </div>
    <form className="figma-link-row" onSubmit={event => { event.preventDefault(); onSync(); }}>
      <input dir="ltr" aria-label="رابط تصميم Figma" type="url" placeholder="https://www.figma.com/design/FILE_KEY/name?node-id=1-2" value={figmaLink} onChange={event => setFigmaLink(event.target.value)} />
      <button type="button" className="secondary-button" onClick={onCheck} disabled={busy}>فحص الاتصال</button>
      <button type="submit" className="primary-button" disabled={busy}>{busy ? 'جارٍ التنفيذ...' : 'مزامنة من Figma'}</button>
      <button type="button" className="secondary-button" onClick={onRefresh} disabled={busy}>تحديث التصميم</button>
    </form>
    {linkInfo && <div className="figma-link-meta"><span>الملف: <code dir="ltr">{linkInfo.fileKey}</code></span><span>العقدة: <code dir="ltr">{linkInfo.nodeId || 'غير محددة'}</code></span><span>تحليل الرابط ليس مزامنة.</span></div>}
    <p className="connection-copy" role="status">{connection?.message || 'لم يُفحص الاتصال بعد.'}</p>
    {connection?.recovery ? <p className="figma-explanation">{connection.recovery}</p> : null}
    <div className="connector-tools">
      <label className="upload-button">استيراد ملف محلي<input aria-label="استيراد JSON أو ZIP أو FIG" accept=".json,.zip,.fig,application/json,application/zip" type="file" onChange={onImport} /></label>
      <label className="node-select">الصفحة أو الإطار أو المكوّن
        <select aria-label="اختيار عقدة التصميم" dir="ltr" value={selectedNodeId} onChange={event => setSelectedNodeId(event.target.value)}>
          <option value="">من رابط Figma</option>
          {nodes.map(node => <option key={node.id} value={node.id}>{node.type} — {node.name} ({node.id})</option>)}
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={onCompare}>تشغيل المقارنة</button>
      <button type="button" className="secondary-button" onClick={onVisual}>تشغيل المقارنة البصرية</button>
      <button type="button" className="secondary-button" onClick={onReport}>توليد التقرير</button>
    </div>
    <details className="pairing-box">
      <summary>إعداد الإضافة ورمز الاقتران</summary>
      <ol>
        <li>ثبّت Figma Desktop وافتح ملف التصميم المصرّح به. الرابط لا يفتحه.</li>
        <li>Plugins → Development → Import plugin from manifest، ثم اختر <code dir="ltr">figma-plugin/manifest.json</code>.</li>
        <li>شغّل Figma Fidelity Connector وألصق الرمز، واترك النافذة مفتوحة.</li>
      </ol>
      <p>الرمز المحلي: <code dir="ltr" data-testid="pairing-token">{pairing || 'سيظهر بعد فحص الاتصال'}</code></p>
    </details>
  </section>;
}
