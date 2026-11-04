import React from 'react';
import { DesignItem } from '../../components/DesignItem.jsx';
import { STORYBOOK_SCENARIOS } from '../../inspection/storybook/storybook-scenarios.mjs';

export function ReactImplementationPanel({
  refNode,
  actual,
  setActual,
  previewUrl,
  selectedScenarioId,
  onSelectScenario,
  playwrightInspection,
  onRunPlaywrightInspection,
  onResetDemoMismatch,
  onMakeExactMatch,
  busy,
}) {
  return (
    <section aria-label="معاينة تنفيذ React وتكامل Storybook وPlaywright" data-testid="react-implementation-section">
      <div className="preview-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>{previewUrl ? 'مرجع التصميم الأصلي (Figma Reference)' : 'مرجع التصميم المطبّع (Canonical Reference)'}</h2>
            <span>
              {refNode?.sourceName} <code dir="ltr">{refNode?.nodeId || ''}</code>
            </span>
          </div>
          <div className="stage stage-compare" data-testid="reference-canvas">
            {previewUrl ? (
              <img alt="مرجع التصميم الأصلي" src={previewUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
              <DesignItem spec={refNode} testId="reference-item" reference />
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>ج. تنفيذ React الفعلي (DesignItem)</h2>
            <span>مشترك مع Storybook وPlaywright</span>
          </div>
          <div className="stage stage-compare" data-testid="actual-canvas">
            <DesignItem spec={actual} testId="react-item" />
          </div>
        </article>
      </div>

      <div className="lower-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>سيناريوهات Storybook السبعة والتحكم بخصائص React</h2>
            <span>Storybook 10.6</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              اختر سيناريو Storybook المعتمد:
            </label>
            <select
              aria-label="سيناريو Storybook"
              data-testid="storybook-scenario-select"
              value={selectedScenarioId}
              onChange={e => onSelectScenario(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            >
              {STORYBOOK_SCENARIOS.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label} — {scenario.description}
                </option>
              ))}
            </select>
          </div>

          <div className="fields">
            <label>
              العرض (px)
              <input
                aria-label="العرض"
                type="number"
                value={actual?.width ?? 112}
                onChange={event => setActual(value => ({ ...value, width: Number(event.target.value) }))}
              />
            </label>
            <label>
              الارتفاع (px)
              <input
                aria-label="الارتفاع"
                type="number"
                value={actual?.height ?? 100}
                onChange={event => setActual(value => ({ ...value, height: Number(event.target.value) }))}
              />
            </label>
            <label>
              الاستدارة (px)
              <input
                aria-label="استدارة الزوايا"
                type="number"
                value={actual?.borderRadius ?? 6}
                onChange={event => setActual(value => ({ ...value, borderRadius: Number(event.target.value) }))}
              />
            </label>
            <label>
              اللون
              <input
                aria-label="اللون"
                type="color"
                value={actual?.backgroundColor || '#ffffff'}
                onChange={event => setActual(value => ({ ...value, backgroundColor: event.target.value }))}
              />
            </label>
            <label>
              حجم الخط (px)
              <input
                aria-label="حجم الخط"
                type="number"
                value={actual?.fontSize ?? 14}
                onChange={event => setActual(value => ({ ...value, fontSize: Number(event.target.value) }))}
              />
            </label>
            <label>
              نوع الخط
              <input
                aria-label="نوع الخط"
                type="text"
                dir="ltr"
                value={actual?.fontFamily || 'Inter'}
                onChange={event => setActual(value => ({ ...value, fontFamily: event.target.value }))}
              />
            </label>
            <label className="full">
              النص
              <input
                aria-label="النص"
                type="text"
                value={actual?.text || ''}
                onChange={event => setActual(value => ({ ...value, text: event.target.value }))}
              />
            </label>
          </div>

          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={onResetDemoMismatch}>
              إعادة الخطأ التجريبي
            </button>
            <button type="button" className="btn btn-success" data-testid="make-react-match-btn" onClick={onMakeExactMatch}>
              اجعل React مطابقًا
            </button>
          </div>
        </article>

        <article className="panel" data-testid="playwright-inspection-panel">
          <div className="panel-head">
            <h2>نتائج فحص Playwright الفعلي ولقطات الشاشة</h2>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="run-playwright-inspect-btn"
              onClick={onRunPlaywrightInspection}
              disabled={busy}
            >
              فحص DOM/CSS عبر Playwright
            </button>
          </div>

          {playwrightInspection ? (
            <div className="diagnostic-box" style={{ marginTop: 0 }}>
              <div>
                <strong>المتصفح المعزول:</strong> <code dir="ltr">{playwrightInspection.browser}</code> | وقت الفحص:{' '}
                <code dir="ltr">{playwrightInspection.inspectedAt}</code>
              </div>
              <div>
                <strong>Desktop ({playwrightInspection.viewport?.width}×{playwrightInspection.viewport?.height}):</strong>{' '}
                <code dir="ltr">
                  W={playwrightInspection.computed?.width}px, H={playwrightInspection.computed?.height}px, BG={playwrightInspection.computed?.backgroundColor}, Radius={playwrightInspection.computed?.borderRadius}px, Font={playwrightInspection.computed?.fontFamily} {playwrightInspection.computed?.fontSize}px
                </code>
              </div>
              {playwrightInspection.mobileComputed && (
                <div>
                  <strong>Mobile (390×844):</strong>{' '}
                  <code dir="ltr">
                    W={playwrightInspection.mobileComputed.width}px, H={playwrightInspection.mobileComputed.height}px, BG={playwrightInspection.mobileComputed.backgroundColor}
                  </code>
                </div>
              )}
              <div>
                <strong>ملفات اللقطات المحفوظة:</strong>{' '}
                <code dir="ltr">out/react-item.png</code> | <code dir="ltr">out/react-item-mobile.png</code> | <code dir="ltr">out/page.png</code>
              </div>
            </div>
          ) : (
            <p className="small">
              اضغط على «فحص DOM/CSS عبر Playwright» لفتح جلسة Chromium معزولة (لا تتداخل مع جلسة <code dir="ltr">figma-reader</code>) واستخراج القيم المحسوبة من المتصفح الحقيقي والتقاط صور حتمية للمكوّن على سطح المكتب والجوال.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

