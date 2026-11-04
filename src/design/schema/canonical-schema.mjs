/**
 * Canonical Design Schema (v2.0.0)
 * Unified schema produced by the Design Normalization Engine from:
 * - Tool 1: @leogcode/figma-reader (Primary CLI / browser / .fig decoder)
 * - Tool 2: openfig-core (Fallback .fig binary parser)
 * - Tool 3: figma-export (Optional legacy ZIP parser)
 * - Direct JSON / Plugin snapshots
 */

export const CANONICAL_SCHEMA_VERSION = '2.0.0';

export const CANONICAL_SOURCES = Object.freeze({
  FIGMA_READER_WEB: 'figma-reader-web',
  FIGMA_READER_LOCAL: 'figma-reader-local',
  OPENFIG_NATIVE: 'openfig-native-file',
  FIGMA_EXPORT_ZIP: 'figma-export-plugin',
  FIGMA_PLUGIN_CONNECTOR: 'figma-plugin-connector',
  FIGMA_REST_JSON: 'figma-rest-json',
});

export const TRACKED_DESIGN_PROPERTIES = Object.freeze([
  'width',
  'height',
  'backgroundColor',
  'borderRadius',
  'text',
  'x',
  'y',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'borderColor',
  'borderWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'opacity',
  'visible',
  'layoutMode',
  'primaryAxisAlign',
  'counterAxisAlign',
  'componentName',
  'variant',
  'imagePresent',
]);

export function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function computeExtractionCoverage(node) {
  const presentAttributes = [];
  const missingAttributes = [];
  for (const key of TRACKED_DESIGN_PROPERTIES) {
    if (node?.[key] !== null && node?.[key] !== undefined) {
      presentAttributes.push(key);
    } else {
      missingAttributes.push(key);
    }
  }
  const totalCatalogCount = TRACKED_DESIGN_PROPERTIES.length;
  const extractedCount = presentAttributes.length;
  const percentage = totalCatalogCount
    ? Math.round((10000 * extractedCount) / totalCatalogCount) / 100
    : 0;
  return {
    extractedCount,
    totalTracked: totalCatalogCount,
    totalCatalogCount,
    percentage,
    presentAttributes,
    missingAttributes,
  };
}

export function createCanonicalNode(partial = {}) {
  const node = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    source: partial.source || CANONICAL_SOURCES.FIGMA_READER_LOCAL,
    sourceName: partial.sourceName || 'Figma Design',
    sourceEditor: partial.sourceEditor || 'figma',
    sourceVersion: partial.sourceVersion || partial.revision || null,
    revision: partial.revision || partial.sourceVersion || null,
    fileKey: partial.fileKey || null,
    nodeId: partial.nodeId || null,
    nodeName: partial.nodeName || 'Unnamed',
    nodeType: partial.nodeType || 'UNKNOWN',
    pageName: partial.pageName || null,
    nodePath: partial.nodePath || null,
    acquiredAt: partial.acquiredAt || partial.exportedAt || partial.fileModifiedAt || null,
    exportedAt: partial.exportedAt || null,
    fileModifiedAt: partial.fileModifiedAt || null,
    account: partial.account || null,

    // Geometry
    width: finiteOrNull(partial.width),
    height: finiteOrNull(partial.height),
    x: finiteOrNull(partial.x),
    y: finiteOrNull(partial.y),
    rotation: finiteOrNull(partial.rotation),
    absolutePosition: partial.absolutePosition || null,

    // Style & Borders
    backgroundColor: partial.backgroundColor ?? null,
    borderColor: partial.borderColor ?? null,
    borderWidth: finiteOrNull(partial.borderWidth),
    borderRadius: finiteOrNull(partial.borderRadius),
    opacity: finiteOrNull(partial.opacity),
    visible: typeof partial.visible === 'boolean' ? partial.visible : null,

    // Typography & Content
    text: typeof partial.text === 'string' ? partial.text : null,
    fontFamily: typeof partial.fontFamily === 'string' ? partial.fontFamily : null,
    fontSize: finiteOrNull(partial.fontSize),
    fontWeight: partial.fontWeight != null ? String(partial.fontWeight) : null,
    lineHeight: finiteOrNull(partial.lineHeight),
    letterSpacing: partial.letterSpacing ?? null,
    textAlign: typeof partial.textAlign === 'string' ? partial.textAlign : null,

    // Auto-Layout, Padding, Gap, Alignment
    layoutMode: typeof partial.layoutMode === 'string' ? partial.layoutMode : null,
    paddingTop: finiteOrNull(partial.paddingTop),
    paddingRight: finiteOrNull(partial.paddingRight),
    paddingBottom: finiteOrNull(partial.paddingBottom),
    paddingLeft: finiteOrNull(partial.paddingLeft),
    gap: finiteOrNull(partial.gap),
    primaryAxisAlign: typeof partial.primaryAxisAlign === 'string' ? partial.primaryAxisAlign : null,
    counterAxisAlign: typeof partial.counterAxisAlign === 'string' ? partial.counterAxisAlign : null,

    // Component Identity
    componentName: typeof partial.componentName === 'string' ? partial.componentName : null,
    componentId: typeof partial.componentId === 'string' ? partial.componentId : null,
    componentSet: typeof partial.componentSet === 'string' ? partial.componentSet : null,
    variant: typeof partial.variant === 'string' ? partial.variant : null,
    componentProperties: partial.componentProperties || null,

    // Assets & Visual References
    imagePresent: Boolean(partial.imagePresent),
    assetReferences: Array.isArray(partial.assetReferences) ? partial.assetReferences : [],
    previewSource: partial.previewSource || null,
    previewUrl: partial.previewUrl || null,
    screenshotBase64: partial.screenshotBase64 || null,

    // Hierarchy & Diagnostics
    childCount: typeof partial.childCount === 'number' ? partial.childCount : 0,
    unsupported: Array.isArray(partial.unsupported) ? partial.unsupported : [],
    note: partial.note || '',
  };

  const coverage = computeExtractionCoverage(node);
  node.missingAttributes = coverage.missingAttributes;
  node.extractionCoverage = coverage;
  return node;
}

export function validateCanonicalDesign(node) {
  const errors = [];
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { valid: false, errors: ['Canonical node must be a non-null object'] };
  }
  if (!node.source || typeof node.source !== 'string') {
    errors.push('Missing or invalid source identifier');
  }
  if (!node.nodeName || typeof node.nodeName !== 'string') {
    errors.push('Missing or invalid nodeName');
  }
  if (!node.nodeType || typeof node.nodeType !== 'string') {
    errors.push('Missing or invalid nodeType');
  }
  if (!Array.isArray(node.missingAttributes)) {
    errors.push('Missing missingAttributes array');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

