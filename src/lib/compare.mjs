/** Five inspectable properties only. Not an overall pixel-fidelity percentage. */
export const FIELD_CONFIG = [
  { key: 'width', label: 'العرض', weight: 25, unit: 'px', kind: 'number' },
  { key: 'height', label: 'الارتفاع', weight: 20, unit: 'px', kind: 'number' },
  { key: 'backgroundColor', label: 'لون الخلفية', weight: 25, kind: 'color' },
  { key: 'borderRadius', label: 'استدارة الزوايا', weight: 15, unit: 'px', kind: 'number' },
  { key: 'text', label: 'النص', weight: 15, kind: 'text' },
];

export function normalizeHexColor(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + [...s.slice(1)].map(ch => ch + ch).join('').toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/);
  if (!rgb) return null;
  return '#' + rgb.slice(1).map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function figmaColorToHex(color) {
  if (!color) return null;
  const channels = [color.r, color.g, color.b];
  if (!channels.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  return '#' + channels.map(n => Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function normalizeJsonNode(node, metadata = {}) {
  const box = node.absoluteBoundingBox || {};
  const fill = Array.isArray(node.fills) ? node.fills.find(p => p?.type === 'SOLID' && p.visible !== false) : null;
  return {
    source: 'figma-rest-json', sourceName: metadata.name ?? 'Unspecified',
    sourceEditor: metadata.editorType ?? 'unknown', nodeId: node.id ?? null,
    nodeName: node.name ?? 'Unnamed', nodeType: node.type ?? 'UNKNOWN',
    width: typeof box.width === 'number' ? box.width : null,
    height: typeof box.height === 'number' ? box.height : null,
    backgroundColor: figmaColorToHex(fill?.color),
    borderRadius: typeof node.cornerRadius === 'number' ? node.cornerRadius : null,
    text: typeof node.characters === 'string' ? node.characters : null,
    fontSize: typeof node.style?.fontSize === 'number' ? node.style.fontSize : null,
    fontFamily: node.style?.fontFamily || null,
    absolutePosition: typeof box.x === 'number' && typeof box.y === 'number' ? { x: box.x, y: box.y } : null,
    note: 'الأبعاد المطلقة X/Y تخص صفحة Figma؛ لا تُقارن مباشرة بإحداثيات المتصفح.'
  };
}

/** Calculates % of *available* five property checks, weighted proportionately. */
export function compareSpecs(reference, actual) {
  if (!reference || !actual) return {score: null, rows: [], passed: 0, total: 0};
  let weightedTotal = 0; let earned = 0; let passed = 0;
  const rows = FIELD_CONFIG.filter(field => reference[field.key] !== null && reference[field.key] !== undefined).map(field => {
    const expected = reference[field.key], raw = actual[field.key];
    const actualValue = raw === undefined ? null : raw;
    let match = false;
    if (field.kind === 'number') match = actualValue !== null && Number.isFinite(Number(actualValue)) && Math.abs(Number(actualValue) - Number(expected)) <= 1;
    else if (field.kind === 'color') match = normalizeHexColor(expected) !== null && normalizeHexColor(expected) === normalizeHexColor(actualValue);
    else match = actualValue !== null && String(expected).trim().replace(/\s+/g, ' ') === String(actualValue).trim().replace(/\s+/g, ' ');
    weightedTotal += field.weight;
    if (match) { earned += field.weight; passed++; }
    return { ...field, expected, actual: actualValue, match, gap: field.kind === 'number' && actualValue !== null ? Math.round((Number(actualValue) - Number(expected)) * 100) / 100 : null };
  });
  return { score: weightedTotal ? Math.round(10000 * earned / weightedTotal) / 100 : null, passed, total: rows.length, rows, metricLabel: 'نسبة مطابقة الخصائص المفحوصة (ليست تطابق بكسلات)' };
}
