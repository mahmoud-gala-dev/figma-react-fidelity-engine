import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { normalizeHexColor } from '../../lib/compare.mjs';

export const VIEWPORT_PRESETS = Object.freeze({
  desktop: { name: 'desktop', width: 1440, height: 950, deviceScaleFactor: 1 },
  mobile: { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
});

function mapFlexAlignToFigma(cssAlign) {
  const val = String(cssAlign || '').toLowerCase();
  if (val.includes('center')) return 'CENTER';
  if (val.includes('end') || val.includes('flex-end')) return 'MAX';
  if (val.includes('between')) return 'SPACE_BETWEEN';
  if (val.includes('start') || val.includes('flex-start') || val === 'normal') return 'MIN';
  return null;
}

/**
 * Inspects a live React component via Playwright in an isolated, ephemeral headless browser.
 * Explicitly isolated from `.browser-profile-figma-reader` so it never interferes with figma-reader's session.
 */
export async function inspectReactComponent({
  url = process.env.MVP_URL || 'http://127.0.0.1:5173',
  selector = '[data-testid="react-item"]',
  viewport = VIEWPORT_PRESETS.desktop,
  alsoInspectMobile = true,
  captureScreenshots = true,
  outDir = path.resolve('out'),
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: viewport.width || 1440, height: viewport.height || 950 },
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    const locator = page.locator(selector).first();
    await locator.waitFor({ timeout: 10_000 });

    const raw = await locator.evaluate(el => {
      const css = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement ? el.parentElement.getBoundingClientRect() : { left: 0, top: 0 };
      const parseNum = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
      };
      const display = css.display || '';
      const flexDir = css.flexDirection || '';
      let layoutMode = null;
      if (display.includes('flex')) {
        layoutMode = flexDir.startsWith('column') ? 'VERTICAL' : 'HORIZONTAL';
      }
      return {
        nodeId: el.getAttribute('data-figma-id') || null,
        tagName: el.tagName.toLowerCase(),
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        x: Math.round((rect.left - parentRect.left) * 100) / 100,
        y: Math.round((rect.top - parentRect.top) * 100) / 100,
        backgroundColor: css.backgroundColor,
        borderColor: css.borderTopColor,
        borderWidth: parseNum(css.borderTopWidth),
        borderRadius: parseNum(css.borderTopLeftRadius) ?? 0,
        fontFamily: (css.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim() || null,
        fontSize: parseNum(css.fontSize),
        fontWeight: css.fontWeight || null,
        lineHeight: parseNum(css.lineHeight),
        text: (el.textContent || '').trim(),
        paddingTop: parseNum(css.paddingTop),
        paddingRight: parseNum(css.paddingRight),
        paddingBottom: parseNum(css.paddingBottom),
        paddingLeft: parseNum(css.paddingLeft),
        gap: parseNum(css.gap) ?? parseNum(css.columnGap) ?? 0,
        layoutMode,
        justifyContent: css.justifyContent,
        alignItems: css.alignItems,
        opacity: parseNum(css.opacity) ?? 1,
        visible: css.visibility !== 'hidden' && css.display !== 'none' && parseFloat(css.opacity || '1') > 0,
        imagePresent: Boolean(el.querySelector('img, svg') || (css.backgroundImage && css.backgroundImage !== 'none')),
      };
    });

    const computed = {
      ...raw,
      backgroundColor: normalizeHexColor(raw.backgroundColor) || raw.backgroundColor,
      borderColor:
        raw.borderWidth && raw.borderWidth > 0
          ? normalizeHexColor(raw.borderColor) || raw.borderColor
          : null,
      borderWidth: raw.borderWidth && raw.borderWidth > 0 ? raw.borderWidth : null,
      primaryAxisAlign: mapFlexAlignToFigma(raw.justifyContent),
      counterAxisAlign: mapFlexAlignToFigma(raw.alignItems),
    };

    const screenshots = {};
    if (captureScreenshots) {
      const desktopItemPath = path.join(outDir, 'react-item.png');
      const fullPagePath = path.join(outDir, 'page.png');
      await locator.screenshot({ path: desktopItemPath, animations: 'disabled' });
      await page.screenshot({ path: fullPagePath, fullPage: true, animations: 'disabled' });
      screenshots.desktopItem = desktopItemPath;
      screenshots.fullPage = fullPagePath;
    }

    let mobileComputed = null;
    if (alsoInspectMobile) {
      await page.setViewportSize({
        width: VIEWPORT_PRESETS.mobile.width,
        height: VIEWPORT_PRESETS.mobile.height,
      });
      mobileComputed = await locator.evaluate(el => {
        const css = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          backgroundColor: css.backgroundColor,
          borderRadius: parseFloat(css.borderTopLeftRadius) || 0,
          fontSize: parseFloat(css.fontSize) || null,
          text: (el.textContent || '').trim(),
        };
      });
      mobileComputed.backgroundColor =
        normalizeHexColor(mobileComputed.backgroundColor) || mobileComputed.backgroundColor;
      if (captureScreenshots) {
        const mobileItemPath = path.join(outDir, 'react-item-mobile.png');
        await locator.screenshot({ path: mobileItemPath, animations: 'disabled' });
        screenshots.mobileItem = mobileItemPath;
      }
    }

    return {
      ok: true,
      inspectedAt: new Date().toISOString(),
      browser: 'Chromium / Playwright (Isolated Ephemeral Context)',
      url,
      selector,
      viewport,
      computed,
      mobileComputed,
      screenshots,
    };
  } finally {
    if (browser) await browser.close();
  }
}

