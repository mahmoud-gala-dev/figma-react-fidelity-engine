import React from 'react';

const STATE_PILLS = {
  connected: ['connected', 'متصل ومصادق (figma-reader)'],
  requires_login: ['requires-setup', 'يتطلب تسجيل دخول لمرة واحدة'],
  awaiting_login: ['synchronizing', 'بانتظار إكمال تسجيل الدخول...'],
  synchronizing: ['synchronizing', 'جارٍ الإرسال والمطابقة...'],
  synchronized: ['synchronized', 'تمت المزامنة والمطابقة'],
  design_changed: ['changed', 'تغيّر التصميم'],
  disconnected: ['disconnected', 'غير متصل'],
  error: ['failed', 'خطأ في الاتصال'],
};

export function FigmaSourcePanel({
  figmaUrl,
  setFigmaUrl,
  readerStatus,
  syncProgress,
  busy,
  aiBusy,
  changeNote,
  onUnifiedSendAndCompare,
  onLoginFigmaReader,
  onOpenFigmaAccount,
  onOpenCurrentUrlInBrowser,
  onToggleAuthSession,
  onRefreshAuthStatus,
  onOpenSettingsPage,
}) {
  const isLoggedIn = Boolean(readerStatus?.loggedIn);

  const effectiveState =
    busy || aiBusy
      ? 'synchronizing'
      : isLoggedIn
        ? 'connected'
        : readerStatus?.hasSynchronizedDesign
          ? 'synchronized'
          : readerStatus?.state || 'requires_login';
  const [pillClass, pillText] = STATE_PILLS[effectiveState] || STATE_PILLS.requires_login;

  return (
    <section
      className="connector-panel minimal-source-hero"
      aria-label="إدخال رابط تصميم Figma والمطابقة الفورية"
      data-testid="minimal-source-panel"
    >
      {/* Compact Account Status Bar — hides browser login buttons when logged in */}
      <div
        className={`account-auth-card ${isLoggedIn ? 'auth-card-logged-in' : 'auth-card-logged-out'}`}
        data-testid="account-auth-card"
        data-logged-in={isLoggedIn ? 'true' : 'false'}
        role="status"
      >
        <div className="account-auth-main">
          <div className="account-auth-info">
            <div className="account-auth-title" data-testid="auth-and-version-box">
              <span
                className={`auth-state-badge ${isLoggedIn ? 'is-logged-in' : 'is-logged-out'}`}
                data-testid="account-login-indicator"
              >
                <span className="status-dot" />
                {isLoggedIn
                  ? `مسجل الدخول (${readerStatus?.user?.email || readerStatus?.account?.name || 'figma-fidelity-mvp'})`
                  : 'غير مسجل الدخول حاليًا'}
              </span>{' '}
              <span className={`status-pill ${pillClass}`} data-testid="connection-state">
                {pillText}
              </span>{' '}
              {isLoggedIn ? (
                <span className="auth-status-text logged-in" data-testid="logged-in-declutter-chip">
                  ✓ تم إخفاء أزرار فتح المتصفح تلقائيًا لتقليل الازدحام البصري.
                </span>
              ) : (
                <span className="auth-status-text logged-out">
                  {readerStatus?.message || 'يمكنك تسجيل الدخول إلى حساب Figma أو استخدام الإرسال المباشر.'}
                </span>
              )}
              <div className="compact-meta-inline" style={{ marginTop: 4 }}>
                <span data-testid="http-dev-mode-badge">
                  <strong>الروابط المدعومة:</strong> <code dir="ltr">HTTPS</code> و<code dir="ltr">HTTP</code>
                </span>
                {' • '}
                <span>
                  <strong>الحالة:</strong> <span data-testid="sync-progress-text">{syncProgress || 'جاهز للإرسال والمطابقة'}</span>
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
            >
              {isLoggedIn ? 'تبديل حالة الحساب' : '✓ تم تسجيل الدخول (إخفاء الأزرار)'}
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
            {onOpenSettingsPage && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                data-testid="quick-open-settings-btn"
                onClick={onOpenSettingsPage}
              >
                ⚙️ الإعدادات المتقدمة
              </button>
            )}
          </div>
        </div>

        {/* Browser Login Buttons Row — ONLY shown when NOT logged in (!isLoggedIn) */}
        {!isLoggedIn && (
          <div className="browser-login-drawer" data-testid="browser-login-controls">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="login-figma-reader-btn"
              onClick={onLoginFigmaReader}
              disabled={busy}
            >
              🌐 فتح المتصفح وتسجيل الدخول (Open Browser &amp; Login)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="open-figma-account-btn"
              onClick={onOpenFigmaAccount}
              disabled={busy}
            >
              👤 فتح الحساب وملفات Figma (Open Account)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="open-current-url-btn"
              onClick={onOpenCurrentUrlInBrowser}
              disabled={busy}
            >
              🔗 فتح الرابط الحالي في المتصفح
            </button>
          </div>
        )}
      </div>

      {/* Ultra-Clean Final Input: ONLY the Figma URL Input + Single Action Button */}
      <form
        className="minimal-url-form"
        data-testid="minimal-url-form"
        onSubmit={event => {
          event.preventDefault();
          onUnifiedSendAndCompare();
        }}
      >
        <label htmlFor="main-figma-url-input" className="minimal-url-label">
          رابط تصميم فيجما (Figma Design URL)
        </label>
        <div className="minimal-url-row">
          <input
            id="main-figma-url-input"
            dir="ltr"
            data-testid="figma-url-input"
            aria-label="رابط تصميم Figma"
            type="text"
            placeholder="https://www.figma.com/design/FILE_KEY/name?node-id=942-2734"
            value={figmaUrl}
            onChange={event => setFigmaUrl(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-unified-action"
            data-testid="sync-figma-btn"
            disabled={busy || aiBusy}
          >
            {busy || aiBusy
              ? 'جارٍ الإرسال والمطابقة واستخراج النتائج...'
              : 'إرسال ومطابقة واستخراج النتائج والمقارنة'}
          </button>
        </div>
      </form>

      {changeNote ? <div className="notice">{changeNote}</div> : null}
    </section>
  );
}
