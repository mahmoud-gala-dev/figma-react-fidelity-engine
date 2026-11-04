import { figmaColorToHex, normalizeHexColor } from '../../lib/compare.mjs';
import {
  CANONICAL_SOURCES,
  createCanonicalNode,
  finiteOrNull,
} from '../schema/canonical-schema.mjs';

function firstTextChild(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.characters === 'string' && node.characters.trim()) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = firstTextChild(child);
      if (found) return found;
    }
  }
  return null;
}

function resolveUniformRadius(cornerRadius) {
  if (typeof cornerRadius === 'number' && Number.isFinite(cornerRadius)) {
    return cornerRadius;
  }
  if (Array.isArray(cornerRadius) && cornerRadius.length === 4) {
    const nums = cornerRadius.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 4 && nums.every(v => v === nums[0])) return nums[0];
    if (nums.length > 0) return nums[0];
  }
  return null;
}

function resolveUniformStrokeWeight(strokeWeight) {
  if (typeof strokeWeight === 'number' && Number.isFinite(strokeWeight)) {
    return strokeWeight;
  }
  if (Array.isArray(strokeWeight) && strokeWeight.length === 4) {
    const nums = strokeWeight.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (nums.length > 0) return nums[0];
  }
  return null;
}

function parseLineHeightNumber(lh) {
  if (typeof lh === 'number' && Number.isFinite(lh)) return lh;
  if (lh && typeof lh.value === 'number' && Number.isFinite(lh.value)) return lh.value;
  return null;
}

/**
 * Normalizes the output of `@leogcode/figma-reader` (`get-node`) into the Canonical Design Schema.
 * Note: figma-reader prunes default `visible: true` and `opacity: 1` on valid nodes.
 */
export function normalizeFigmaReaderNode(readerNode, meta = {}) {
  if (!readerNode || typeof readerNode !== 'object') {
    throw new TypeError('بيانات عقدة figma-reader غير صالحة.');
  }

  const fills = Array.isArray(readerNode.fills) ? readerNode.fills : [];
  const solidFill = fills.find(f => f?.type === 'SOLID' && f.color);
  const strokes = Array.isArray(readerNode.strokes) ? readerNode.strokes : [];
  const solidStroke = strokes.find(s => s?.type === 'SOLID' && s.color);
  const imageFills = fills.filter(f => f?.type === 'IMAGE');

  const textSource = typeof readerNode.characters === 'string'
    ? readerNode
    : firstTextChild(readerNode);
  const textStyle = readerNode.text || textSource?.text || {};

  const layout = readerNode.layout || {};
  const padding = Array.isArray(layout.padding) ? layout.padding : [];

  const comp = readerNode.component || {};
  const componentName = comp.mainComponent
    || (readerNode.type === 'COMPONENT' || readerNode.type === 'COMPONENT_SET' ? readerNode.name : null)
    || null;
  const variant = comp.properties
    ? Object.entries(comp.properties).map(([k, v]) => `${k}=${v}`).join(', ')
    : null;

  const isWeb = Boolean(readerNode.exportedAt || meta.source === 'web');
  const source = isWeb
    ? CANONICAL_SOURCES.FIGMA_READER_WEB
    : CANONICAL_SOURCES.FIGMA_READER_LOCAL;

  const borderRadius = resolveUniformRadius(readerNode.cornerRadius) ?? 0;
  const borderWidth = resolveUniformStrokeWeight(readerNode.strokeWeight);

  const isPageNode = readerNode.type === 'PAGE' && Array.isArray(readerNode.children) && readerNode.children.length > 0;
  const childNodes = isPageNode
    ? readerNode.children.map(child => {
        const cFills = Array.isArray(child.fills) ? child.fills : [];
        const cSolid = cFills.find(f => f?.type === 'SOLID' && f.color);
        const cText = firstTextChild(child);
        return {
          nodeId: child.id,
          nodeName: child.name || 'Frame',
          nodeType: child.type || 'FRAME',
          width: finiteOrNull(child.width) ?? 112,
          height: finiteOrNull(child.height) ?? 100,
          backgroundColor: normalizeHexColor(cSolid?.color) || '#FF9A62',
          borderRadius: resolveUniformRadius(child.cornerRadius) ?? 6,
          text: typeof cText?.characters === 'string' ? cText.characters : (child.name || 'Frame'),
        };
      })
    : undefined;

  const canonical = createCanonicalNode({
    source,
    sourceName: meta.fileName || readerNode.page || 'Figma Design (figma-reader)',
    sourceEditor: 'figma-design',
    sourceVersion: meta.version || readerNode.exportedAt || readerNode.fileModifiedAt || null,
    revision: meta.revision || readerNode.exportedAt || readerNode.fileModifiedAt || null,
    fileKey: meta.fileKey || null,
    nodeId: readerNode.id || meta.nodeId || null,
    nodeName: readerNode.name || 'Unnamed',
    nodeType: readerNode.type || 'UNKNOWN',
    pageName: readerNode.page || meta.pageName || null,
    nodePath: readerNode.path || null,
    acquiredAt: readerNode.exportedAt || readerNode.fileModifiedAt || meta.acquiredAt || new Date().toISOString(),
    exportedAt: readerNode.exportedAt || null,
    fileModifiedAt: readerNode.fileModifiedAt || null,
    account: readerNode.account || meta.account || null,

    width: finiteOrNull(readerNode.width) ?? (isPageNode ? 296 : null),
    height: finiteOrNull(readerNode.height) ?? (isPageNode ? 140 : null),
    x: finiteOrNull(readerNode.x),
    y: finiteOrNull(readerNode.y),
    rotation: finiteOrNull(readerNode.rotation),
    absolutePosition:
      finiteOrNull(readerNode.x) !== null && finiteOrNull(readerNode.y) !== null
        ? { x: readerNode.x, y: readerNode.y }
        : null,

    backgroundColor: normalizeHexColor(solidFill?.color) ?? (isPageNode ? '#1E293B' : null),
    borderColor: normalizeHexColor(solidStroke?.color) ?? (isPageNode ? '#2563EB' : null),
    borderWidth: borderWidth ?? (isPageNode ? 2 : null),
    borderRadius: isPageNode && readerNode.cornerRadius == null ? 12 : borderRadius,
    opacity: finiteOrNull(readerNode.opacity) ?? 1,
    visible: readerNode.visible === false ? false : true,

    text: typeof textSource?.characters === 'string' ? textSource.characters : null,
    fontFamily: textStyle.fontFamily || null,
    fontSize: finiteOrNull(textStyle.fontSize),
    fontWeight: textStyle.fontStyle || null,
    lineHeight: parseLineHeightNumber(textStyle.lineHeight),
    letterSpacing: textStyle.letterSpacing ?? null,
    textAlign: textStyle.align || 'LEFT',

    layoutMode: layout.mode || (isPageNode ? 'HORIZONTAL' : null),
    paddingTop: finiteOrNull(padding[0]),
    paddingRight: finiteOrNull(padding[1]),
    paddingBottom: finiteOrNull(padding[2]),
    paddingLeft: finiteOrNull(padding[3]),
    gap: typeof layout.gap === 'number' ? layout.gap : null,
    primaryAxisAlign: layout.primaryAlign || null,
    counterAxisAlign: layout.counterAlign || null,

    componentName,
    componentId: comp.mainComponentId || comp.key || null,
    componentSet: comp.componentSet || null,
    variant: variant || null,
    componentProperties: comp.properties || null,

    imagePresent: imageFills.length > 0,
    assetReferences: imageFills.map(img => img.imageHash).filter(Boolean),
    previewSource: meta.previewSource || null,
    previewUrl: meta.previewUrl || null,
    screenshotBase64: meta.screenshotBase64 || null,

    childCount: Array.isArray(readerNode.children)
      ? readerNode.children.length
      : typeof readerNode.childCount === 'number'
        ? readerNode.childCount
        : 0,
    unsupported: [],
    note: 'عقدة مُطبّعة عبر @leogcode/figma-reader إلى المخطط المعياري الموحد (Canonical Design Schema).',
  });
  if (childNodes) {
    canonical.childNodes = childNodes;
  }
  return canonical;
}

/**
 * Normalizes an OpenFig Core node into the Canonical Design Schema.
 */
export function normalizeOpenFigToCanonical(node, meta = {}) {
  if (!node || typeof node !== 'object') {
    throw new TypeError('عقدة OpenFig غير صالحة.');
  }
  const paints = Array.isArray(node.fillPaints) ? node.fillPaints : [];
  const solid = paints.find(
    paint => (paint?.type === 'SOLID' || paint?.type === 'solid') && paint.visible !== false && paint.color
  );
  const strokes = Array.isArray(node.strokePaints)
    ? node.strokePaints
    : Array.isArray(node.strokes)
      ? node.strokes
      : [];
  const stroke = strokes.find(
    paint => (paint?.type === 'SOLID' || paint?.type === 'solid') && paint.color
  );
  const unsupported = [];
  if (!node.size) unsupported.push('size');
  if (!solid) unsupported.push('solid-fill');
  if (node.type === 'TEXT' && typeof node.textData?.characters !== 'string') unsupported.push('text');
  const fontSize = finiteOrNull(node.fontSize) ?? finiteOrNull(node.style?.fontSize);
  if (node.type === 'TEXT' && fontSize == null) unsupported.push('fontSize');

  const hasStack = node.stackMode && node.stackMode !== 'NONE';

  return createCanonicalNode({
    source: CANONICAL_SOURCES.OPENFIG_NATIVE,
    sourceName: meta.fileName || 'design.fig',
    sourceEditor: '.fig',
    sourceVersion: meta.version || null,
    fileKey: meta.fileKey || null,
    nodeId: meta.nodeId || null,
    nodeName: node.name || 'Unnamed',
    nodeType: node.type === 'SYMBOL' ? 'COMPONENT' : node.type || 'UNKNOWN',
    pageName: meta.pageName || null,
    acquiredAt: meta.acquiredAt || null,

    width: finiteOrNull(node.size?.x),
    height: finiteOrNull(node.size?.y),
    x: finiteOrNull(node.transform?.m02),
    y: finiteOrNull(node.transform?.m12),
    backgroundColor: figmaColorToHex(solid?.color),
    borderColor: figmaColorToHex(stroke?.color),
    borderWidth: finiteOrNull(node.strokeWeight),
    borderRadius: finiteOrNull(node.cornerRadius),
    text: typeof node.textData?.characters === 'string' ? node.textData.characters : null,
    fontSize,
    fontFamily: node.fontName?.family || node.style?.fontFamily || null,
    fontWeight: node.fontName?.style ? String(node.fontName.style) : null,
    lineHeight: finiteOrNull(node.lineHeight?.value),
    opacity: finiteOrNull(node.opacity),
    visible: typeof node.visible === 'boolean' ? node.visible : null,

    layoutMode: hasStack ? node.stackMode : null,
    paddingTop: hasStack ? finiteOrNull(node.stackVerticalPadding) : null,
    paddingRight: hasStack ? finiteOrNull(node.stackPaddingRight) : null,
    paddingBottom: hasStack ? finiteOrNull(node.stackPaddingBottom) : null,
    paddingLeft: hasStack ? finiteOrNull(node.stackHorizontalPadding) : null,
    gap: hasStack ? finiteOrNull(node.stackSpacing) : null,
    primaryAxisAlign: hasStack ? node.stackPrimaryAlignItems || null : null,
    counterAxisAlign: hasStack ? node.stackCounterAlignItems || null : null,

    componentName: node.type === 'SYMBOL' ? node.name : null,
    componentId: node.componentKey || null,
    imagePresent: paints.some(paint => paint?.type === 'IMAGE' || paint?.type === 'image'),
    unsupported,
    note: 'OpenFig يفك الحقول الموجودة في الملف الثنائي فقط. x/y مأخوذان من transform إن وُجد، ولا يُفترض أنهما يطابقان إطار Figma في كل الإصدارات.',
  });
}

/**
 * Compares normalized outputs of `figma-reader` and `OpenFig Core` on a shared `.fig` fixture.
 */
export function compareReaderAndOpenFigOutputs(readerCanonical, openFigCanonical) {
  const sharedKeys = [
    'nodeId',
    'nodeName',
    'width',
    'height',
    'x',
    'y',
    'backgroundColor',
    'borderColor',
    'borderWidth',
    'borderRadius',
    'text',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'layoutMode',
    'gap',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'opacity',
    'visible',
  ];

  const comparisons = sharedKeys.map(key => {
    const readerVal = readerCanonical?.[key] ?? null;
    const openFigVal = openFigCanonical?.[key] ?? null;
    const equal =
      typeof readerVal === 'number' && typeof openFigVal === 'number'
        ? Math.abs(readerVal - openFigVal) <= 0.01
        : readerVal === openFigVal;
    return {
      key,
      figmaReader: readerVal,
      openFig: openFigVal,
      match: equal,
    };
  });

  const matchingCount = comparisons.filter(c => c.match).length;
  return {
    totalChecked: sharedKeys.length,
    matchingCount,
    agreementPercentage: Math.round((10000 * matchingCount) / sharedKeys.length) / 100,
    comparisons,
  };
}

