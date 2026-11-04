import { figmaColorToHex, normalizeHexColor } from '../../lib/compare.mjs';

const TRACKED = ['width', 'height', 'backgroundColor', 'borderRadius', 'text', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'x', 'y', 'opacity', 'borderColor', 'borderWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];

export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function missingAttributes(ref) {
  return TRACKED.filter(key => ref[key] == null);
}

export function normalizePluginNode(node, meta = {}) {
  if (!node || typeof node !== 'object') throw new TypeError('عقدة الإضافة غير صالحة.');
  const ref = {
    source: 'figma-plugin-connector',
    sourceName: meta.fileName || 'Figma Desktop',
    sourceEditor: meta.editorType || 'figma',
    fileKey: meta.fileKey || null,
    nodeId: typeof node.id === 'string' ? node.id : null,
    nodeName: typeof node.name === 'string' ? node.name : 'Unnamed',
    nodeType: typeof node.type === 'string' ? node.type : 'UNKNOWN',
    width: finiteNumber(node.width),
    height: finiteNumber(node.height),
    x: finiteNumber(node.x),
    y: finiteNumber(node.y),
    backgroundColor: normalizeHexColor(node.backgroundColor),
    borderColor: normalizeHexColor(node.borderColor),
    borderWidth: finiteNumber(node.borderWidth),
    borderRadius: finiteNumber(node.borderRadius),
    text: typeof node.text === 'string' ? node.text : null,
    fontSize: finiteNumber(node.fontSize),
    fontFamily: typeof node.fontFamily === 'string' ? node.fontFamily : null,
    fontWeight: node.fontWeight == null ? null : String(node.fontWeight),
    lineHeight: finiteNumber(node.lineHeight),
    paddingTop: finiteNumber(node.paddingTop),
    paddingRight: finiteNumber(node.paddingRight),
    paddingBottom: finiteNumber(node.paddingBottom),
    paddingLeft: finiteNumber(node.paddingLeft),
    opacity: finiteNumber(node.opacity),
    visible: typeof node.visible === 'boolean' ? node.visible : null,
    layoutMode: typeof node.layoutMode === 'string' ? node.layoutMode : null,
    primaryAxisAlign: typeof node.primaryAxisAlign === 'string' ? node.primaryAxisAlign : null,
    counterAxisAlign: typeof node.counterAxisAlign === 'string' ? node.counterAxisAlign : null,
    componentName: typeof node.componentName === 'string' ? node.componentName : null,
    variant: typeof node.variant === 'string' ? node.variant : null,
    imagePresent: node.imagePresent === true,
    revision: meta.revision || null,
    exportedAt: meta.exportedAt || null,
    childCount: Array.isArray(node.children) ? node.children.length : 0,
    unsupported: Array.isArray(node.unsupported) ? node.unsupported.filter(item => typeof item === 'string').slice(0, 40) : [],
    previewSource: meta.previewSource || null,
    note: 'x/y من الإضافة نسبيان للعقدة الأب وليسا إحداثيات الصفحة في المتصفح. الحقول الغائبة مذكورة في missingAttributes.',
  };
  ref.missingAttributes = missingAttributes(ref);
  return ref;
}

/** Maps the fields OpenFig Core 0.4 exposes. Unmapped Figma attributes stay null. */
export function normalizeOpenFigNode(node, meta = {}) {
  if (!node || typeof node !== 'object') throw new TypeError('عقدة OpenFig غير صالحة.');
  const paints = Array.isArray(node.fillPaints) ? node.fillPaints : [];
  const solid = paints.find(paint => (paint?.type === 'SOLID' || paint?.type === 'solid') && paint.visible !== false && paint.color);
  const strokes = Array.isArray(node.strokePaints) ? node.strokePaints : Array.isArray(node.strokes) ? node.strokes : [];
  const stroke = strokes.find(paint => (paint?.type === 'SOLID' || paint?.type === 'solid') && paint.color);
  const unsupported = [];
  if (!node.size) unsupported.push('size');
  if (!solid) unsupported.push('solid-fill');
  if (node.type === 'TEXT' && typeof node.textData?.characters !== 'string') unsupported.push('text');
  const fontSize = finiteNumber(node.fontSize) ?? finiteNumber(node.style?.fontSize);
  if (node.type === 'TEXT' && fontSize == null) unsupported.push('fontSize');
  const ref = {
    source: 'openfig-native-file',
    sourceName: meta.fileName || 'design.fig',
    sourceEditor: '.fig',
    nodeId: meta.nodeId || null,
    nodeName: node.name || 'Unnamed',
    nodeType: node.type || 'UNKNOWN',
    width: finiteNumber(node.size?.x),
    height: finiteNumber(node.size?.y),
    x: finiteNumber(node.transform?.m02),
    y: finiteNumber(node.transform?.m12),
    backgroundColor: figmaColorToHex(solid?.color),
    borderColor: figmaColorToHex(stroke?.color),
    borderWidth: finiteNumber(node.strokeWeight),
    borderRadius: finiteNumber(node.cornerRadius),
    text: typeof node.textData?.characters === 'string' ? node.textData.characters : null,
    fontSize,
    fontFamily: node.fontName?.family || node.style?.fontFamily || null,
    fontWeight: node.fontName?.style ? String(node.fontName.style) : null,
    lineHeight: finiteNumber(node.lineHeight?.value),
    opacity: finiteNumber(node.opacity),
    visible: typeof node.visible === 'boolean' ? node.visible : null,
    imagePresent: paints.some(paint => paint?.type === 'IMAGE' || paint?.type === 'image'),
    absolutePosition: null,
    unsupported,
    note: 'OpenFig يفك الحقول الموجودة في الملف الثنائي فقط. x/y مأخوذان من transform إن وُجد، ولا يُفترض أنهما يطابقان إطار Figma في كل الإصدارات.',
  };
  ref.missingAttributes = missingAttributes(ref);
  return ref;
}
