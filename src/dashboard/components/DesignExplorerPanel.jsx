import React, { useMemo, useState } from 'react';

export function DesignExplorerPanel({
  hierarchy,
  nodes,
  selectedNodeId,
  onSelectNode,
  refNode,
  parserComparison,
  onCompareParsers,
  busy,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const pages = hierarchy?.pages || [];
  const frames = hierarchy?.frames || [];
  const components = hierarchy?.components || [];
  const allNodes = hierarchy?.allNodes?.length ? hierarchy.allNodes : nodes || [];

  const filteredNodes = useMemo(() => {
    return allNodes.filter(item => {
      const matchesType =
        typeFilter === 'ALL' ||
        (typeFilter === 'PAGE' && (item.type === 'PAGE' || item.type === 'CANVAS')) ||
        (typeFilter === 'FRAME' && ['FRAME', 'GROUP', 'SECTION'].includes(item.type)) ||
        (typeFilter === 'COMPONENT' && ['COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SYMBOL'].includes(item.type)) ||
        item.type === typeFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.id || '').toLowerCase().includes(q) ||
        String(item.type || '').toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [allNodes, searchQuery, typeFilter]);

  return (
    <section className="panel" aria-label="مستكشف التصميم (Design Explorer)" data-testid="design-explorer-panel" style={{ margin: '20px 0' }}>
      <div className="panel-head">
        <div>
          <h2>ب. مستكشف شجرة التصميم (Design Explorer)</h2>
          <span>
            الصفحات: <strong>{pages.length}</strong> | الإطارات (Frames): <strong>{frames.length}</strong> | المكوّنات (Components): <strong>{components.length}</strong> | إجمالي العقد: <strong>{allNodes.length}</strong>
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="compare-parsers-btn"
          onClick={onCompareParsers}
          disabled={busy}
        >
          مقارنة figma-reader مع OpenFig Core
        </button>
      </div>

      <div className="connector-row" style={{ marginBottom: 14 }}>
        <input
          type="search"
          aria-label="بحث في عقد التصميم"
          data-testid="explorer-search-input"
          placeholder="ابحث بالاسم أو معرّف العقدة (مثل Buy ice cream أو 942:2734)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: '1 1 280px', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          تصفية حسب النوع:{' '}
          <select
            aria-label="تصفية نوع العقدة"
            data-testid="explorer-type-filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          >
            <option value="ALL">الكل ({allNodes.length})</option>
            <option value="PAGE">الصفحات (Pages: {pages.length})</option>
            <option value="FRAME">الإطارات (Frames: {frames.length})</option>
            <option value="COMPONENT">المكوّنات (Components: {components.length})</option>
            <option value="TEXT">النصوص (Text)</option>
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          اختيار سريع للعقدة:{' '}
          <select
            aria-label="اختيار عقدة التصميم"
            dir="ltr"
            value={selectedNodeId}
            onChange={e => onSelectNode(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          >
            <option value="">العقدة الحالية ({refNode?.nodeId || '—'})</option>
            {filteredNodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.type} — {node.name} ({node.id})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="preview-grid" style={{ marginTop: 10 }}>
        <div className="diagnostic-box" style={{ marginTop: 0, maxHeight: 220, overflowY: 'auto' }}>
          <strong>قائمة الصفحات والإطارات والمكوّنات المطابقة للبحث ({filteredNodes.length}):</strong>
          <ul style={{ margin: '8px 0 0', paddingRight: 18 }}>
            {filteredNodes.map(node => (
              <li key={node.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  style={{
                    background: node.id === (selectedNodeId || refNode?.nodeId) ? '#dbeafe' : 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <code dir="ltr">{node.id}</code> — <strong>{node.type}</strong>: {node.name}
                  {node.width != null && node.height != null ? ` (${node.width}×${node.height})` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="diagnostic-box" style={{ marginTop: 0 }} data-testid="selected-node-details">
          <strong>تفاصيل العقدة المحددة (Selected Node Details):</strong>
          <div>الاسم: <strong>{refNode?.nodeName || '—'}</strong> (<code dir="ltr">{refNode?.nodeId || '—'}</code>)</div>
          <div>النوع: <code dir="ltr">{refNode?.nodeType || '—'}</code> | الصفحة: <code dir="ltr">{refNode?.pageName || '—'}</code></div>
          <div>الأبعاد والموضع: <code dir="ltr">W={refNode?.width ?? '—'}px, H={refNode?.height ?? '—'}px, X={refNode?.x ?? '—'}, Y={refNode?.y ?? '—'}</code></div>
          <div>الألوان والزوايا: الخلفية <code dir="ltr">{refNode?.backgroundColor ?? '—'}</code> | الإطار <code dir="ltr">{refNode?.borderColor ?? '—'} ({refNode?.borderWidth ?? 0}px)</code> | الزوايا <code dir="ltr">{refNode?.borderRadius ?? 0}px</code></div>
          <div>الطباعة: الخط <code dir="ltr">{refNode?.fontFamily ?? '—'}</code> | الحجم <code dir="ltr">{refNode?.fontSize ?? '—'}px</code> | الوزن <code dir="ltr">{refNode?.fontWeight ?? '—'}</code> | ارتفاع السطر <code dir="ltr">{refNode?.lineHeight ?? '—'}px</code></div>
          <div>التخطيط والمسافات: <code dir="ltr">{refNode?.layoutMode ?? 'NONE'}</code> | Gap <code dir="ltr">{refNode?.gap ?? '—'}px</code> | Padding <code dir="ltr">[{refNode?.paddingTop ?? '—'}, {refNode?.paddingRight ?? '—'}, {refNode?.paddingBottom ?? '—'}, {refNode?.paddingLeft ?? '—'}]</code></div>
          <div>تغطية الاستخراج من المرجع: <strong>{refNode?.extractionCoverage?.percentage ?? '—'}%</strong> ({refNode?.extractionCoverage?.extractedCount ?? '—'} / {refNode?.extractionCoverage?.totalTracked ?? 24} خاصية)</div>
        </div>
      </div>

      {parserComparison && (
        <div className="diagnostic-box" data-testid="parser-comparison-box">
          <strong>نتيجة مقارنة المحللين (figma-reader مقابل OpenFig Core على الملف الثنائي الموحد <code dir="ltr">{parserComparison.fixture}</code>):</strong>{' '}
          نسبة التطابق: <strong>{parserComparison.comparison?.agreementPercentage}%</strong> ({parserComparison.comparison?.matchingCount} من {parserComparison.comparison?.totalChecked} خاصية معيارية متطابقة).
        </div>
      )}
    </section>
  );
}

