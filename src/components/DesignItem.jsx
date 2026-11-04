import React from 'react';

/** Shared fixture, used by Dashboard, Storybook, and Playwright. */
export function DesignItem({spec, testId = 'design-item', reference = false}) {
  const width = Number(spec?.width);
  const height = Number(spec?.height);
  return (
    <div data-testid={testId}
      className={`visual-item${reference ? ' faded' : ''}`}
      style={{
        width: Number.isFinite(width) ? width : 112,
        height: Number.isFinite(height) ? height : 100,
        backgroundColor: spec?.backgroundColor || '#D5DCE8',
        borderRadius: Number(spec?.borderRadius || 0),
        boxSizing: 'border-box', display:'flex', alignItems:'center',
        justifyContent:'center', padding:10, textAlign:'center',
        overflow:'hidden', flexShrink:0, color:'#1C1D27',
        fontSize: Number(spec?.fontSize || 14),
        fontFamily: spec?.fontFamily || 'Arial, sans-serif'
      }}>
      {spec?.text ?? spec?.nodeName ?? ''}
    </div>
  );
}
