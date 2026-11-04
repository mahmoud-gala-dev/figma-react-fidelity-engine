import React, {useEffect, useMemo, useState} from 'react';
import {compareSpecs, FIELD_CONFIG, normalizeJsonNode} from './lib/compare.mjs';
import {DesignItem} from './components/DesignItem.jsx';
import {parseFigmaLink} from './lib/figma-link.mjs';
import {importJsonObject, importFigmaExportZip} from './lib/import-design.mjs';

function initialActual(ref) {
  return {
    width: Number((ref.width || 112)) + 28,
    height: Number(ref.height || 100),
    backgroundColor: ref.backgroundColor || '#FF9A62',
    borderRadius: ref.borderRadius ?? 6,
    text: ref.text || ref.nodeName || 'Buy ice cream',
  };
}
const pretty = (v, unit='') => v === null || v === undefined ? 'غير متاح' : `${typeof v === 'number' ? +v.toFixed(2) : v}${unit}`;
export default function App() {
  const [ref,setRef] = useState(null);
  const [actual,setActual] = useState(null);
  const [status,setStatus] = useState('جارٍ قراءة المرجع...');
  const [figmaLink,setFigmaLink] = useState('');
  const [linkInfo,setLinkInfo] = useState(null);
  const [loadingSync,setLoadingSync] = useState(false);
  useEffect(() => { fetch('/reference.json', {cache:'no-store'}).then(r => {if (!r.ok) throw Error('reference.json غير متاح'); return r.json();})
      .then(data => {setRef(data);setActual(initialActual(data));setStatus('تم تحميل البيانات بنجاح');})
      .catch(e => setStatus('خطأ: '+e.message)); }, []);
  function applyImported(result,description) {
    setRef(result.ref); setActual(initialActual(result.ref));
    setStatus(description);
  }
  const analyzeLink = (e) => {
    e?.preventDefault();
    try { const parsed=parseFigmaLink(figmaLink);setLinkInfo(parsed);
      setStatus(`تم تحليل الرابط: ${parsed.fileKey}${parsed.nodeId?' | العنصر '+parsed.nodeId:''}. لم يتم سحب ملف من Figma بعد.`);
    } catch(error) {setStatus('خطأ في الرابط: '+error.message);setLinkInfo(null);}
  };
  const syncLocalExport = async () => {
    setLoadingSync(true);
    try {
      const parsed=parseFigmaLink(figmaLink);setLinkInfo(parsed);
      const query=new URLSearchParams({fileKey:parsed.fileKey});
      if(parsed.nodeId)query.set('nodeId',parsed.nodeId);
      const response=await fetch('/api/local-figma-export?'+query.toString(),{cache:'no-store'});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'لم يمكن قراءة التصدير المحلي');
      applyImported(result,`تم تحميل ${result.localFile} محليًا من تصدير Figma Export${result.exportedAt?' | '+result.exportedAt:''}.`);
    }catch(error){setStatus('لا يمكن السحب المباشر من Figma بهذا المشروع. '+error.message);}
    finally {setLoadingSync(false);}
  };
  const importLocalFile = async (event) => {
    const file=event.target.files?.[0];
    if(!file)return;
    try {
      if(file.size>50_000_000)throw Error('الحد الأقصى للملف هو 50MB.');
      const parsed=figmaLink.trim()?parseFigmaLink(figmaLink):null;
      if(parsed)setLinkInfo(parsed);
      if(file.name.toLowerCase().endsWith('.zip')) {
        const imported=importFigmaExportZip(new Uint8Array(await file.arrayBuffer()),{
          fileKey:parsed?.fileKey||null,nodeId:parsed?.nodeId||null
        });
        applyImported(imported,`تم استيراد ZIP من Figma Export: ${file.name}`);
      } else if(file.name.toLowerCase().endsWith('.json')) {
        const root=JSON.parse(await file.text());
        const imported=importJsonObject(root,{nodeId:parsed?.nodeId||null,fileName:file.name});
        applyImported(imported,`تم استيراد JSON: ${file.name}`);
      } else throw Error('الأنواع المدعومة هنا JSON و ZIP فقط. استخدم npm run extract:fig لملفات .fig.');
    }catch(error){setStatus('فشل الاستيراد: '+error.message);}
    finally{event.target.value='';}
  };
  const result = useMemo(() => compareSpecs(ref,actual), [ref,actual]);
  const update = (key, value) => setActual(v => ({...v,[key]: ['width','height','borderRadius'].includes(key) ? Number(value) : value}));
  const report = () => { if (!ref || !actual) return; const blob = new Blob([JSON.stringify({generatedAt:new Date().toISOString(),reference:ref,reactImplementation:actual,comparison:result},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='fidelity-report.json'; a.click(); URL.revokeObjectURL(url); };
  if (!ref || !actual) return <main className="app"><h1>Figma Fidelity MVP</h1><p>{status}</p></main>;
  return <div className="app">
    <header className="app-header"><div><div className="eyebrow">DEMO • OFFLINE FIRST</div><h1>مختبر مطابقة تصميم Figma مع React</h1><p>نموذج إثبات فكرة: مقارنة خمس خصائص هندسية ومرئية قابلة للفحص.</p></div><div className="score"><span>نسبة مطابقة الخصائص</span><strong data-testid="score">{result.score ?? '—'}%</strong><small>{result.passed} من {result.total} خصائص متوافقة</small></div></header>
    <div className="notice"><b>مصدر المرجع:</b> {ref.sourceName} | {ref.nodeName} <span dir="ltr">({ref.nodeId || 'No ID'})</span>. العرض الأيسر تمثيل مُنشأ من JSON، <b>وليس لقطة أصلية من Figma</b>. النسبة ليست Pixel Fidelity.</div>
    <section className="figma-link-panel" aria-label="ربط تصميم Figma">
      <div className="figma-link-heading"><div><strong>رابط تصميم Figma</strong><p>انسخ رابط العنصر من Figma باستخدام Copy link to selection. نستخدم الرابط لتحديد ملف التصميم والعنصر.</p></div><span className="offline-pill">بدون REST API</span></div>
      <form className="figma-link-row" onSubmit={analyzeLink}>
        <input dir="ltr" aria-label="رابط تصميم Figma" type="url" placeholder="https://www.figma.com/design/FILE_KEY/...?...node-id=123-456" value={figmaLink} onChange={e=>setFigmaLink(e.target.value)} />
        <button type="submit" className="secondary-button">تحليل الرابط</button>
        <button type="button" className="primary-button" onClick={syncLocalExport} disabled={loadingSync}>{loadingSync?'جارٍ الفحص...':'جلب آخر تصدير محلي'}</button>
      </form>
      {linkInfo && <div className="figma-link-meta"><span>معرّف الملف: <code dir="ltr">{linkInfo.fileKey}</code></span><span>معرّف العنصر: <code dir="ltr">{linkInfo.nodeId||'غير محدد'}</code></span></div>}
      <p className="figma-explanation"><b>تنبيه:</b> إدخال الرابط وحده لا يمنح وصولًا لتصميم Figma السحابي. على Windows شغّل إضافة Figma Export داخل Figma Desktop، ثم صدّر Full ZIP وضعه في <code dir="ltr">input/figma-exports</code> واضغط «جلب آخر تصدير محلي»؛ أو ارفع ZIP من الزر أدناه. لا يتم إرسال الرابط لخوادم خارجية.</p>
    </section>
    <section className="upload-toolbar"><div><b>استيراد بيانات Figma محليًا</b><span>ملف JSON أو ZIP من إضافة Figma Export؛ عند إدخال رابط يُستخدم node-id لاختيار العنصر بدقة.</span></div><label className="upload-button">اختيار JSON / ZIP<input aria-label="رفع مرجع Figma JSON أو ZIP" accept=".json,.zip,application/json,application/zip" type="file" onChange={importLocalFile}/></label><small role="status">{status}</small></section>
    <section className="preview-grid">
      <article className="panel"><div className="panel-head"><h2>مرجع Figma (تمثيل من البيانات)</h2><span>لا يتم تعديله</span></div><div className="stage stage-compare" data-testid="reference-canvas"><DesignItem spec={ref} testId="reference-item" reference /></div></article>
      <article className="panel"><div className="panel-head"><h2>تنفيذ React الفعلي</h2><span>تقدر تعدله مباشرة</span></div><div className="stage stage-compare" data-testid="actual-canvas"><DesignItem spec={actual} testId="react-item" /></div></article>
    </section>
    <section className="lower-grid">
      <article className="panel"><div className="panel-head"><h2>تحكم في تنفيذ React</h2></div><div className="fields">
        <label>العرض (px)<input aria-label="العرض" type="number" value={actual.width} step="1" min="1" onChange={e=>update('width',e.target.value)} /></label>
        <label>الارتفاع (px)<input aria-label="الارتفاع" type="number" value={actual.height} step="0.01" min="1" onChange={e=>update('height',e.target.value)} /></label>
        <label>استدارة الزوايا (px)<input aria-label="استدارة الزوايا" type="number" value={actual.borderRadius} step="1" min="0" onChange={e=>update('borderRadius',e.target.value)} /></label>
        <label>اللون<input aria-label="اللون" type="color" value={actual.backgroundColor || '#FFFFFF'} onChange={e=>update('backgroundColor',e.target.value)} /></label>
        <label className="full">النص<input aria-label="النص" type="text" value={actual.text} onChange={e=>update('text',e.target.value)} /></label>
      </div><div className="actions"><button onClick={()=>setActual(initialActual(ref))}>إعادة الخطأ التجريبي</button><button className="primary" onClick={()=>setActual({width:ref.width,height:ref.height,backgroundColor:ref.backgroundColor,borderRadius:ref.borderRadius,text:ref.text})}>اجعل React مطابقًا</button></div></article>
      <article className="panel"><div className="panel-head"><h2>الأخطاء التي اكتشفها النظام</h2></div><table><thead><tr><th>الخاصية</th><th>Figma</th><th>React</th><th>النتيجة</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.key} className={r.match?'ok':'bad'}><td>{r.label}</td><td dir="ltr">{pretty(r.expected,r.unit)}</td><td dir="ltr">{pretty(r.actual,r.unit)}</td><td>{r.match?'مطابق':'مختلف'}</td></tr>)}</tbody></table><div className="actions"><button onClick={report}>تنزيل تقرير JSON</button><button onClick={()=>window.print()}>طباعة الصفحة / PDF</button></div><p className="small">الأوزان: {FIELD_CONFIG.map(f=>`${f.label} ${f.weight}%`).join('، ')}. سماحية قياس الأبعاد: 1px.</p></article>
    </section><footer>تجربة محلية | Storybook: :6006 | مقارنة خصائص حقيقية عبر Playwright | الصور المرجعية الحقيقية تُستورد منفصلة</footer>
  </div>;
}
