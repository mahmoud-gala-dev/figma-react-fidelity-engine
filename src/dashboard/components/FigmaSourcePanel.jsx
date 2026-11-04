import React from 'react';

const STATE_PILLS = {
  connected: ['connected', 'متصل ومصادق (figma-reader)'],
  requires_login: ['requires-setup', 'يتطلب تسجيل دخول لمرة واحدة (figma-reader)'],
  awaiting_login: ['synchronizing', 'بانتظار إكمال تسجيل الدخول...'],
  synchronizing: ['synchronizing', 'جارٍ المزامنة...'],
  synchronized: ['synchronized', 'تمت المزامنة (figma-reader)'],
  design_changed: ['changed', 'تغيّر التصميم'],
  disconnected: ['disconnected', 'غير متصل'],
  error: ['failed', 'خطأ في الاتصال'],
};

export function FigmaSourcePanel({
  figmaUrl,
  setFigmaUrl,
  urlInfo,
  readerStatus,
  syncProgress,
  busy,
  refNode,
  changeNote,
  onParseUrl,
  onSyncFromFigma,
  onRefreshDesign,
  onLoginFigmaReader,
  onOpenFigmaAccount,
  onOpenCurrentUrlInBrowser,
  onSyncLocalFixture,
  onImportLocalFile,
}) {
  const effectiveState = busy
    ? 'synchronizing'
    : readerStatus?.hasSynchronizedDesign
      ? 'synchronized'
      : readerStatus?.state || 'requires_login';
  const [pillClass, pillText] = STATE_PILLS[effectiveState] || STATE_PILLS.requires_login;

  return (
    <section className="connector-panel" aria-label="مصدر تصميم Figma (figma-reader)">
      <div className="connector-header">
        <div>
          <h2>أ. مصدر تصميم Figma (الموصّل الأساسي: figma-reader CLI)</h2>
          <p>
            مزامنة مباشرة عبر <code dir="ltr">@leogcode/figma-reader</code> باستخدام ملف تعريف متصفح محلي مستقل — دون Figma REST API أو Personal Access Tokens أو إضافات إلزامية. (وضع التطوير مفعّل: يقبل روابط <code dir="ltr">HTTPS</code> و<code dir="ltr">HTTP</code>).
          </p>
        </div>
        <span className={`status-pill ${pillClass}`} data-testid="connection-state">
          {pillText}
        </span>
      </div>

      <form
        className="connector-row"
        onSubmit={event => {
          event.preventDefault();
          onSyncFromFigma(false);
        }}
      >
        <input
          dir="ltr"
          data-testid="figma-url-input"
          aria-label="رابط تصميم Figma"
          type="text"
          placeholder="https://www.figma.com/design/FILE_KEY/name?node-id=1-2 أو http:// في وضع التطوير"
          value={figmaUrl}
          onChange={event => setFigmaUrl(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="parse-url-btn"
          onClick={onParseUrl}
          disabled={busy}
        >
          تحليل الرابط (Parse URL)
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="sync-figma-btn"
          disabled={busy}
        >
          {busy ? 'جارٍ المزامنة...' : 'مزامنة من Figma (Sync from Figma)'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          data-testid="refresh-figma-btn"
          onClick={() => onRefreshDesign()}
          disabled={busy}
        >
          تحديث التصميم (Refresh Design)
        </button>
      </form>

      <div className="connector-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="login-figma-reader-btn"
          onClick={onLoginFigmaReader}
          disabled={busy}
        >
          🌐 فتح المتصفح وتسجيل الدخول (Open Browser &amp; Login)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="open-figma-account-btn"
          onClick={onOpenFigmaAccount}
          disabled={busy}
        >
          👤 فتح الحساب وملفات Figma (Open Account)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="open-current-url-btn"
          onClick={onOpenCurrentUrlInBrowser}
          disabled={busy}
        >
          🔗 فتح الرابط الحالي في المتصفح
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="sync-local-fixture-btn"
          onClick={onSyncLocalFixture}
          disabled={busy}
        >
          مزامنة ملف .fig المرجعي عبر figma-reader
        </button>
        <label className="upload-button">
          استيراد بديل / قديم (.fig / .zip / .json)
          <input
            aria-label="استيراد JSON أو ZIP أو FIG"
            type="file"
            accept=".json,.zip,.fig,application/json,application/zip"
            onChange={onImportLocalFile}
          />
        </label>
      </div>

      {urlInfo && (
        <div className="diagnostic-box" data-testid="parsed-url-info">
          <strong>نتيجة تحليل الرابط:</strong> مفتاح الملف:{' '}
          <code dir="ltr">{urlInfo.fileKey}</code> | معرّف العقدة:{' '}
          <code dir="ltr">{urlInfo.nodeId || 'غير محدد'}</code> | البروتوكول:{' '}
          <code dir="ltr">{urlInfo.isHttpDev ? 'HTTP (Development Mode)' : 'HTTPS'}</code> | النوع:{' '}
          <code dir="ltr">{urlInfo.surface || 'design'}</code> | اسم الملف:{' '}
          <code dir="ltr">{urlInfo.fileName || '—'}</code>
        </div>
      )}

      <div className="diagnostic-box" role="status" data-testid="auth-and-version-box">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <strong>حالة المصادقة (Authentication Status):</strong>{' '}
            {readerStatus?.loggedIn ? (
              <span style={{ color: '#15803d', fontWeight: 700 }}>
                مصادق ({readerStatus?.user?.email || readerStatus?.account?.name || 'figma-fidelity-mvp'})
              </span>
            ) : (
              <span style={{ color: '#b45309', fontWeight: 600 }}>
                {readerStatus?.message || 'حزمة figma-reader جاهزة. يلزم تسجيل الدخول لمرة واحدة في المتصفح المخصص لسحب التصاميم السحابية.'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="auth-box-open-browser-btn"
              onClick={onLoginFigmaReader}
              disabled={busy}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              فتح المتصفح وتسجيل الدخول
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="auth-box-open-account-btn"
              onClick={onOpenFigmaAccount}
              disabled={busy}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              فتح الحساب (figma.com/files)
            </button>
          </div>
        </div>
        {readerStatus?.recovery ? <div><strong>الإجراء المقترح:</strong> {readerStatus.recovery}</div> : null}
        <div data-testid="http-dev-mode-badge">
          <strong>وضع التطوير للروابط (URL Protocol Mode):</strong>{' '}
          <span style={{ color: '#0369a1', fontWeight: 600 }}>
            يدعم روابط HTTPS وروابط HTTP في وضع التطوير (figma.com و 127.0.0.1 / localhost)
          </span>
        </div>
        <div>
          <strong>تقدم المزامنة (Sync Progress):</strong>{' '}
          <span data-testid="sync-progress-text">{syncProgress || 'جاهز للمزامنة'}</span>
        </div>
        <div>
          <strong>إصدار التصميم والطابع الزمني (Version &amp; Timestamp):</strong>{' '}
          المصدر: <code dir="ltr">{refNode?.source || '—'}</code> | الإصدار/التعديل:{' '}
          <code dir="ltr">{refNode?.sourceVersion || refNode?.fileModifiedAt || refNode?.exportedAt || 'نسخة محلية'}</code>{' '}
          | وقت الاستحواذ: <code dir="ltr">{refNode?.acquiredAt || '—'}</code>
        </div>
      </div>

      {changeNote ? <div className="notice">{changeNote}</div> : null}
    </section>
  );
}

