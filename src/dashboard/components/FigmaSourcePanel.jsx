import React, { useState } from 'react';

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
  onToggleAuthSession,
  onRefreshAuthStatus,
  onSyncLocalFixture,
  onImportLocalFile,
}) {
  const [showTechMeta, setShowTechMeta] = useState(false);
  const isLoggedIn = Boolean(readerStatus?.loggedIn);

  const effectiveState = busy
    ? 'synchronizing'
    : isLoggedIn
      ? 'connected'
      : readerStatus?.hasSynchronizedDesign
        ? 'synchronized'
        : readerStatus?.state || 'requires_login';
  const [pillClass, pillText] = STATE_PILLS[effectiveState] || STATE_PILLS.requires_login;

  return (
    <section className="connector-panel" aria-label="مصدر تصميم Figma (figma-reader)">
      <div className="connector-header">
        <div>
          <h2>أ. مصدر تصميم Figma وحالة الحساب (الموصّل الأساسي: figma-reader CLI)</h2>
          <p>
            مزامنة مباشرة عبر <code dir="ltr">@leogcode/figma-reader</code> باستخدام ملف تعريف متصفح محلي مستقل — دون الحاجة إلى Personal Access Tokens.
          </p>
        </div>
        <div className="header-badges">
          <span
            className={`auth-state-badge ${isLoggedIn ? 'is-logged-in' : 'is-logged-out'}`}
            data-testid="account-login-indicator"
          >
            <span className="status-dot" />
            {isLoggedIn
              ? `مسجل الدخول حاليًا (${readerStatus?.user?.email || readerStatus?.account?.name || 'figma-fidelity-mvp'})`
              : 'غير مسجل الدخول حاليًا على الحساب'}
          </span>
          <span className={`status-pill ${pillClass}`} data-testid="connection-state">
            {pillText}
          </span>
        </div>
      </div>

      {/* Account Login Status & Conditional Browser Login Controls */}
      <div
        className={`account-auth-card ${isLoggedIn ? 'auth-card-logged-in' : 'auth-card-logged-out'}`}
        data-testid="account-auth-card"
        data-logged-in={isLoggedIn ? 'true' : 'false'}
        role="status"
      >
        <div className="account-auth-main">
          <div className="account-auth-info">
            <div className="account-auth-title" data-testid="auth-and-version-box">
              <strong>حالة الحساب والمصادقة (Account Status):</strong>{' '}
              {isLoggedIn ? (
                <span className="auth-status-text logged-in" data-testid="logged-in-declutter-chip">
                  ✓ أنت مسجل الدخول حاليًا على حساب Figma ({readerStatus?.user?.email || readerStatus?.account?.name || 'figma-fidelity-mvp'}) — تم إخفاء أزرار فتح المتصفح تلقائيًا لتقليل الازدحام البصري.
                </span>
              ) : (
                <span className="auth-status-text logged-out">
                  {readerStatus?.message || 'أنت غير مسجل الدخول حاليًا على حساب Figma. تظهر أدناه أزرار فتح المتصفح لإتمام تسجيل الدخول.'}
                </span>
              )}
              <div className="compact-meta-inline" style={{ marginTop: 6 }}>
                <span data-testid="http-dev-mode-badge">
                  <strong>وضع الروابط:</strong> يدعم <code dir="ltr">HTTPS</code> و<code dir="ltr">HTTP</code> (Development Mode)
                </span>
                {' • '}
                <span>
                  <strong>التقدم:</strong> <span data-testid="sync-progress-text">{syncProgress || 'جاهز للمزامنة'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="account-auth-actions">
            {!isLoggedIn && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="auth-box-open-browser-btn"
                  onClick={onLoginFigmaReader}
                  disabled={busy}
                >
                  فتح المتصفح وتسجيل الدخول
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="auth-box-open-account-btn"
                  onClick={onOpenFigmaAccount}
                  disabled={busy}
                >
                  فتح الحساب (figma.com/files)
                </button>
              </>
            )}
            <button
              type="button"
              className={`btn btn-sm ${isLoggedIn ? 'btn-ghost-subtle' : 'btn-success'}`}
              data-testid="toggle-auth-state-btn"
              onClick={() => onToggleAuthSession?.(!isLoggedIn)}
              disabled={busy}
              title={
                isLoggedIn
                  ? 'التبديل إلى وضع غير مسجل لإظهار أزرار فتح المتصفح مرة أخرى'
                  : 'تأكيد أنك سجلت الدخول في المتصفح لإخفاء أزرار تسجيل الدخول وتقليل الازدحام البصري'
              }
            >
              {isLoggedIn ? 'إظهار خيارات المتصفح / تبديل الحساب' : '✓ تم تسجيل الدخول (إخفاء الأزرار)'}
            </button>
            {onRefreshAuthStatus && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid="refresh-auth-status-btn"
                onClick={onRefreshAuthStatus}
                disabled={busy}
              >
                فحص الحالة
              </button>
            )}
          </div>
        </div>

        {/* Browser Login Buttons Row — ONLY shown when NOT logged in (!isLoggedIn) */}
        {!isLoggedIn && (
          <div className="browser-login-drawer" data-testid="browser-login-controls">
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
          </div>
        )}
      </div>

      {/* Main Figma URL Input & Sync Controls */}
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
          تحليل الرابط
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="sync-figma-btn"
          disabled={busy}
        >
          {busy ? 'جارٍ المزامنة...' : 'مزامنة من Figma'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          data-testid="refresh-figma-btn"
          onClick={() => onRefreshDesign()}
          disabled={busy}
        >
          تحديث التصميم
        </button>
      </form>

      {/* Secondary Offline/Local Fixture Toolbar (Compact to reduce visual clutter) */}
      <div className="secondary-source-bar">
        <div className="secondary-source-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="sync-local-fixture-btn"
            onClick={onSyncLocalFixture}
            disabled={busy}
          >
            📦 مزامنة ملف .fig المرجعي عبر figma-reader
          </button>
          <label className="upload-button btn-sm">
            📂 استيراد ملف محلي (.fig / .zip / .json)
            <input
              aria-label="استيراد JSON أو ZIP أو FIG"
              type="file"
              accept=".json,.zip,.fig,application/json,application/zip"
              onChange={onImportLocalFile}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-link-toggle"
          onClick={() => setShowTechMeta(v => !v)}
        >
          {showTechMeta ? 'إخفاء تفاصيل المصدر ▲' : 'عرض تفاصيل الإصدار والمصدر ▼'}
        </button>
      </div>

      {urlInfo && (
        <div className="diagnostic-box compact-box" data-testid="parsed-url-info">
          <strong>نتيجة تحليل الرابط:</strong> مفتاح الملف:{' '}
          <code dir="ltr">{urlInfo.fileKey}</code> | معرّف العقدة:{' '}
          <code dir="ltr">{urlInfo.nodeId || 'غير محدد'}</code> | البروتوكول:{' '}
          <code dir="ltr">{urlInfo.isHttpDev ? 'HTTP (Development Mode)' : 'HTTPS'}</code> | النوع:{' '}
          <code dir="ltr">{urlInfo.surface || 'design'}</code> | اسم الملف:{' '}
          <code dir="ltr">{urlInfo.fileName || '—'}</code>
        </div>
      )}

      {showTechMeta && (
        <div className="diagnostic-box compact-box">
          <strong>إصدار التصميم والطابع الزمني:</strong>{' '}
          المصدر: <code dir="ltr">{refNode?.source || '—'}</code> | الإصدار/التعديل:{' '}
          <code dir="ltr">{refNode?.sourceVersion || refNode?.fileModifiedAt || refNode?.exportedAt || 'نسخة محلية'}</code>{' '}
          | وقت الاستحواذ: <code dir="ltr">{refNode?.acquiredAt || '—'}</code>
        </div>
      )}

      {changeNote ? <div className="notice">{changeNote}</div> : null}
    </section>
  );
}
