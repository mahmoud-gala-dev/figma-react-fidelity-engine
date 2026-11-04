import React from 'react';

/** Shared fixture, used by Dashboard, Storybook, and Playwright. */
export function DesignItem({ spec, testId = 'design-item', reference = false, showAuthenticImage = true }) {
  const width = Number(spec?.width);
  const height = Number(spec?.height);
  const borderWidth = Number(spec?.borderWidth || 0);
  const borderColor = spec?.borderColor || 'transparent';

  // If we have a genuine screenshot and this is the reference view, display authentic image
  if (reference && showAuthenticImage && spec?.screenshotBase64) {
    return (
      <div
        data-testid={testId}
        className="visual-item authentic-preview"
        style={{
          width: Number.isFinite(width) ? width : 112,
          height: Number.isFinite(height) ? height : 100,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          borderRadius: Number(spec?.borderRadius || 0),
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none'
        }}
        title="لقطة بكسل أصلية مستخرجة من Figma"
      >
        <img
          src={`data:image/png;base64,${spec.screenshotBase64}`}
          alt={spec?.text || spec?.nodeName || 'Figma Reference'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  const hasCustomPadding =
    spec?.paddingTop != null ||
    spec?.paddingRight != null ||
    spec?.paddingBottom != null ||
    spec?.paddingLeft != null;

  return (
    <div
      data-testid={testId}
      data-figma-id={spec?.nodeId || ''}
      className={`visual-item${reference ? ' faded' : ''}`}
      style={{
        width: Number.isFinite(width) ? width : 112,
        height: Number.isFinite(height) ? height : 100,
        backgroundColor: spec?.backgroundColor || '#D5DCE8',
        borderRadius: Number(spec?.borderRadius ?? 0),
        border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: spec?.layoutMode === 'VERTICAL' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...(hasCustomPadding
          ? {
              paddingTop: Number(spec?.paddingTop ?? 10),
              paddingRight: Number(spec?.paddingRight ?? 10),
              paddingBottom: Number(spec?.paddingBottom ?? 10),
              paddingLeft: Number(spec?.paddingLeft ?? 10),
            }
          : { padding: 10 }),
        ...(spec?.gap != null ? { gap: Number(spec.gap) } : {}),
        textAlign: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        color: '#1C1D27',
        fontSize: Number(spec?.fontSize || 14),
        fontFamily: spec?.fontFamily || 'Arial, sans-serif',
        fontWeight: spec?.fontWeight || 'normal',
        ...(spec?.lineHeight != null ? { lineHeight: `${Number(spec.lineHeight)}px` } : {}),
        opacity: typeof spec?.opacity === 'number' ? spec.opacity : 1,
        visibility: spec?.visible === false ? 'hidden' : 'visible',
      }}
    >
      {spec?.text ?? spec?.nodeName ?? ''}
    </div>
  );
}
