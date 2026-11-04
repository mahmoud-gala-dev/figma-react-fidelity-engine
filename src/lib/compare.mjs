/**
 * Comprehensive Design Spec & Fidelity Comparison Engine
 * Preserves the baseline 5-property model while supporting all 18+ canonical design categories (24 fields):
 * - Width & Height (tolerance ±1px)
 * - Position (X, Y)
 * - Background Colors (hex/rgb normalized)
 * - Borders & Strokes (Color & Width)
 * - Border Radius
 * - Typography (Font Family, Font Size, Font Weight, Line Height)
 * - Text Content
 * - Spacing (Padding Top/Right/Bottom/Left, Gap)
 * - Alignment & Layout Direction (layoutMode, primaryAxisAlign, counterAxisAlign)
 * - Opacity & Visibility
 * - Component Identity (componentName, variant)
 * - Images & Icons (imagePresent)
 */

export const COMPARISON_STATUS = Object.freeze({
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  ERROR: 'ERROR',
});

export const FIELD_CONFIG = [
  { key: 'width', label: 'العرض', weight: 25, unit: 'px', kind: 'number', category: 'geometry', cssProp: 'width' },
  { key: 'height', label: 'الارتفاع', weight: 20, unit: 'px', kind: 'number', category: 'geometry', cssProp: 'height' },
  { key: 'backgroundColor', label: 'لون الخلفية', weight: 25, kind: 'color', category: 'style', cssProp: 'backgroundColor' },
  { key: 'borderRadius', label: 'استدارة الزوايا', weight: 15, unit: 'px', kind: 'number', category: 'geometry', cssProp: 'borderRadius' },
  { key: 'text', label: 'النص', weight: 15, kind: 'text', category: 'content', cssProp: 'children / textContent' },
];

export const EXTENDED_FIELDS = [
  ...FIELD_CONFIG,
  { key: 'x', label: 'الموضع الأفقي داخل الأب', weight: 8, unit: 'px', kind: 'number', category: 'geometry', cssProp: 'left / x' },
  { key: 'y', label: 'الموضع الرأسي داخل الأب', weight: 8, unit: 'px', kind: 'number', category: 'geometry', cssProp: 'top / y' },
  { key: 'fontSize', label: 'حجم الخط', weight: 10, unit: 'px', kind: 'number', category: 'typography', cssProp: 'fontSize' },
  { key: 'fontFamily', label: 'نوع الخط', weight: 10, kind: 'text', category: 'typography', cssProp: 'fontFamily' },
  { key: 'fontWeight', label: 'وزن الخط', weight: 5, kind: 'fontWeight', category: 'typography', cssProp: 'fontWeight' },
  { key: 'lineHeight', label: 'ارتفاع السطر', weight: 5, unit: 'px', kind: 'number', category: 'typography', cssProp: 'lineHeight' },
  { key: 'borderColor', label: 'لون الإطار', weight: 10, kind: 'color', category: 'style', cssProp: 'borderColor' },
  { key: 'borderWidth', label: 'سمك الإطار', weight: 5, unit: 'px', kind: 'number', category: 'style', cssProp: 'borderWidth' },
  { key: 'paddingTop', label: 'الحشوة العلوية', weight: 4, unit: 'px', kind: 'number', category: 'spacing', cssProp: 'paddingTop' },
  { key: 'paddingRight', label: 'الحشوة اليمنى', weight: 4, unit: 'px', kind: 'number', category: 'spacing', cssProp: 'paddingRight' },
  { key: 'paddingBottom', label: 'الحشوة السفلية', weight: 4, unit: 'px', kind: 'number', category: 'spacing', cssProp: 'paddingBottom' },
  { key: 'paddingLeft', label: 'الحشوة اليسرى', weight: 4, unit: 'px', kind: 'number', category: 'spacing', cssProp: 'paddingLeft' },
  { key: 'gap', label: 'المسافة البينية (Gap)', weight: 4, unit: 'px', kind: 'number', category: 'spacing', cssProp: 'gap' },
  { key: 'opacity', label: 'الشفافية', weight: 5, kind: 'number', category: 'style', tolerance: 0.02, cssProp: 'opacity' },
  { key: 'visible', label: 'الظهور', weight: 6, kind: 'boolean', category: 'style', cssProp: 'visibility / display' },
  { key: 'layoutMode', label: 'اتجاه التخطيط (Layout Direction)', weight: 6, kind: 'text', category: 'layout', cssProp: 'flexDirection' },
  { key: 'primaryAxisAlign', label: 'محاذاة المحور الأساسي', weight: 4, kind: 'text', category: 'layout', cssProp: 'justifyContent' },
  { key: 'counterAxisAlign', label: 'محاذاة المحور المقابل', weight: 4, kind: 'text', category: 'layout', cssProp: 'alignItems' },
  { key: 'componentName', label: 'هوية المكوّن (Component Identity)', weight: 4, kind: 'text', category: 'component', cssProp: 'componentName' },
  { key: 'variant', label: 'المتغير (Variant)', weight: 4, kind: 'text', category: 'component', cssProp: 'variant' },
  { key: 'imagePresent', label: 'وجود صور أو أيقونات', weight: 6, kind: 'boolean', category: 'asset', cssProp: 'img / backgroundImage' },
];

export const FIDELITY_FORMULA = 'درجة الخصائص = 100 × مجموع أوزان الحقول المطابقة ÷ مجموع أوزان الحقول الموجودة في المرجع. الحقل الغائب لا يُحسب مطابقًا ولا يدخل المقام. سماحية الأرقام 1، والشفافية 0.02.';

export function normalizeHexColor(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + [...s.slice(1)].map(ch => ch + ch).join('').toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.toUpperCase();
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

export function normalizeFontWeightToken(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase().replace(/[-_\s]+/g, '');
  if (!raw) return null;
  const map = {
    thin: '100',
    hairline: '100',
    extralight: '200',
    ultralight: '200',
    light: '300',
    normal: '400',
    regular: '400',
    book: '400',
    medium: '500',
    semibold: '600',
    demibold: '600',
    bold: '700',
    extrabold: '800',
    ultrabold: '800',
    black: '900',
    heavy: '900',
  };
  return map[raw] || raw;
}

export function normalizeJsonNode(node, metadata = {}) {
  const box = node.absoluteBoundingBox || {};
  const fill = Array.isArray(node.fills) ? node.fills.find(p => p?.type === 'SOLID' && p.visible !== false) : null;
  return {
    source: 'figma-rest-json',
    sourceName: metadata.name ?? 'Unspecified',
    sourceEditor: metadata.editorType ?? 'unknown',
    nodeId: node.id ?? null,
    nodeName: node.name ?? 'Unnamed',
    nodeType: node.type ?? 'UNKNOWN',
    width: typeof box.width === 'number' ? box.width : null,
    height: typeof box.height === 'number' ? box.height : null,
    backgroundColor: figmaColorToHex(fill?.color),
    borderRadius: typeof node.cornerRadius === 'number' ? node.cornerRadius : null,
    text: typeof node.characters === 'string' ? node.characters : null,
    fontSize: typeof node.style?.fontSize === 'number' ? node.style.fontSize : null,
    fontFamily: node.style?.fontFamily || null,
    fontWeight: node.style?.fontWeight || null,
    absolutePosition: typeof box.x === 'number' && typeof box.y === 'number' ? { x: box.x, y: box.y } : null,
    note: 'الأبعاد المطلقة X/Y تخص صفحة Figma؛ لا تُقارن مباشرة بإحداثيات المتصفح.'
  };
}

function determineSeverity(field, match, gap) {
  if (match) return 'none';
  if (field.key === 'text') return 'high';
  if (field.key === 'backgroundColor') return 'high';
  if (field.key === 'width' || field.key === 'height') {
    return Math.abs(gap || 0) > 10 ? 'high' : 'medium';
  }
  if (field.category === 'typography') return 'medium';
  return 'low';
}

function buildRecommendation(field, expected, actualValue, match, status) {
  if (status === COMPARISON_STATUS.NOT_AVAILABLE) {
    return 'الحقل غير متوفر في مرجع Figma الحالي؛ لا يدخل في حساب النتيجة.';
  }
  if (status === COMPARISON_STATUS.NOT_COMPARABLE) {
    return 'الحقل غير قابل للمقارنة المباشرة في سياق العرض الحالي.';
  }
  if (status === COMPARISON_STATUS.ERROR) {
    return `تحقق من صلاحية نوع القيمة للحقل ${field.key} في كلٍ من المرجع والتنفيذ.`;
  }
  if (match) {
    return 'لا يلزم تعديل — القيمة مطابقة للمرجع ضمن السماحية المعتمدة.';
  }
  const unit = field.unit || '';
  if (field.key === 'text') {
    return `حدّث محتوى النص في مكوّن React ليكون "${expected}" بدلًا من "${actualValue ?? 'فارغ'}".`;
  }
  return `عدّل الخاصية ${field.cssProp || field.key} في React لتساوي ${expected}${unit} بدلًا من ${actualValue ?? 'غير محدد'}${actualValue != null ? unit : ''}.`;
}

function formatDifference(field, expected, actualValue, match, gap, status) {
  if (status === COMPARISON_STATUS.NOT_AVAILABLE) return 'غير متاح في المرجع';
  if (status === COMPARISON_STATUS.NOT_COMPARABLE) return 'غير قابل للمقارنة';
  if (status === COMPARISON_STATUS.ERROR) return 'خطأ في فحص القيمة';
  if (gap !== null && Number.isFinite(gap)) {
    const sign = gap > 0 ? '+' : '';
    return `${sign}${gap}${field.unit || ''}`;
  }
  if (match) return '0 (مطابق)';
  return `${expected ?? '—'} ≠ ${actualValue ?? 'غير متاح'}`;
}

export const CATEGORY_METADATA = Object.freeze({
  geometry: { id: 'geometry', label: 'الأبعاد والهندسة', englishLabel: 'Geometry & Dimensions', icon: '📐' },
  style: { id: 'style', label: 'الألوان والأنماط', englishLabel: 'Colors & Styling', icon: '🎨' },
  typography: { id: 'typography', label: 'الطباعة والخطوط', englishLabel: 'Typography', icon: '🔤' },
  content: { id: 'content', label: 'المحتوى النصي', englishLabel: 'Text Content', icon: '📝' },
  layout: { id: 'layout', label: 'التخطيط والمحاذاة', englishLabel: 'Layout & Alignment', icon: '⊞' },
  spacing: { id: 'spacing', label: 'المسافات والحشوات', englishLabel: 'Spacing & Padding', icon: '↔️' },
  component: { id: 'component', label: 'هوية المكوّن', englishLabel: 'Component Identity', icon: '🧩' },
  asset: { id: 'asset', label: 'الصور والأيقونات', englishLabel: 'Assets & Icons', icon: '🖼️' },
});

function parseHexToRgb(hex) {
  const norm = normalizeHexColor(hex);
  if (!norm || norm.length < 7) return null;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return null;
  return { r, g, b };
}

export function computePropertyMatchPercentage(field, expected, actualValue, match, status) {
  if (status !== COMPARISON_STATUS.MATCH && status !== COMPARISON_STATUS.MISMATCH) return null;
  if (match) return 100;
  if (actualValue === null || actualValue === undefined) return 0;

  if (field.kind === 'number') {
    const numExp = Number(expected);
    const numAct = Number(actualValue);
    if (!Number.isFinite(numExp) || !Number.isFinite(numAct)) return 0;
    const scale = Math.max(Math.abs(numExp), Math.abs(numAct), 1);
    const ratio = 1 - Math.abs(numAct - numExp) / scale;
    return Math.max(0, Math.min(99.9, Math.round(ratio * 1000) / 10));
  }

  if (field.kind === 'color') {
    const rgbExp = parseHexToRgb(expected);
    const rgbAct = parseHexToRgb(actualValue);
    if (!rgbExp || !rgbAct) return 0;
    const dist = Math.sqrt(
      (rgbExp.r - rgbAct.r) ** 2 + (rgbExp.g - rgbAct.g) ** 2 + (rgbExp.b - rgbAct.b) ** 2
    );
    const maxDist = Math.sqrt(3 * 255 * 255);
    return Math.max(0, Math.min(99.9, Math.round((1 - dist / maxDist) * 1000) / 10));
  }

  if (field.kind === 'text' || field.kind === 'fontWeight') {
    const s1 = String(expected).trim().toLowerCase();
    const s2 = String(actualValue).trim().toLowerCase();
    if (!s1 || !s2) return 0;
    const maxLen = Math.max(s1.length, s2.length);
    let same = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
      if (s1[i] === s2[i]) same++;
    }
    return Math.max(0, Math.min(99.9, Math.round((same / maxLen) * 1000) / 10));
  }

  return 0;
}

/**
 * Calculates fidelity metrics, comparable rows, full catalog status rows, category percentages, and discrepancy evidence.
 */
export function compareSpecs(reference, actual, options = {}) {
  if (!reference || !actual || typeof reference !== 'object' || typeof actual !== 'object') {
    return {
      score: null,
      continuousScore: null,
      rows: [],
      catalogRows: [],
      categoryScores: [],
      overallPercentages: {
        propertyFidelity: 0,
        continuousProximity: 0,
        inspectionCoverage: 0,
        exactPassRate: 0,
        mismatchRate: 0,
      },
      passed: 0,
      total: 0,
      coverage: { tested: 0, totalAvailable: 0, fieldsCount: EXTENDED_FIELDS.length, percentage: 0 },
      severityCounts: { high: 0, medium: 0, low: 0 },
      statusCounts: {
        [COMPARISON_STATUS.MATCH]: 0,
        [COMPARISON_STATUS.MISMATCH]: 0,
        [COMPARISON_STATUS.NOT_AVAILABLE]: EXTENDED_FIELDS.length,
        [COMPARISON_STATUS.NOT_COMPARABLE]: 0,
        [COMPARISON_STATUS.ERROR]: 0,
      },
    };
  }

  const fields = options.coreOnly ? FIELD_CONFIG : EXTENDED_FIELDS;
  const nonComparableKeys = new Set(options.nonComparableKeys || []);
  const elementName = reference.nodeName || reference.text || 'DesignItem';
  const refSourceLabel = reference.source || 'figma-reference';

  let weightedTotal = 0;
  let earned = 0;
  let continuousEarned = 0;
  let passed = 0;
  let comparableCount = 0;
  const severityCounts = { high: 0, medium: 0, low: 0 };
  const statusCounts = {
    [COMPARISON_STATUS.MATCH]: 0,
    [COMPARISON_STATUS.MISMATCH]: 0,
    [COMPARISON_STATUS.NOT_AVAILABLE]: 0,
    [COMPARISON_STATUS.NOT_COMPARABLE]: 0,
    [COMPARISON_STATUS.ERROR]: 0,
  };

  const categoryBuckets = new Map();
  for (const meta of Object.values(CATEGORY_METADATA)) {
    categoryBuckets.set(meta.id, {
      ...meta,
      passed: 0,
      total: 0,
      catalogCount: 0,
      weightEarned: 0,
      continuousWeightEarned: 0,
      weightTotal: 0,
    });
  }

  const rows = [];
  const catalogRows = [];

  for (const field of fields) {
    const catBucket = categoryBuckets.get(field.category);
    if (catBucket) catBucket.catalogCount += 1;

    const expected = reference[field.key];
    const raw = actual[field.key];
    const actualValue = raw === undefined ? null : raw;

    if (nonComparableKeys.has(field.key)) {
      statusCounts[COMPARISON_STATUS.NOT_COMPARABLE] += 1;
      catalogRows.push({
        ...field,
        elementName,
        property: field.key,
        expected: expected ?? null,
        actual: actualValue,
        match: false,
        matchPercentage: null,
        gap: null,
        difference: formatDifference(field, expected, actualValue, false, null, COMPARISON_STATUS.NOT_COMPARABLE),
        severity: 'none',
        status: COMPARISON_STATUS.NOT_COMPARABLE,
        evidence: `الحقل ${field.key} مستبعد من المقارنة المباشرة في هذا السياق.`,
        recommendation: buildRecommendation(field, expected, actualValue, false, COMPARISON_STATUS.NOT_COMPARABLE),
      });
      continue;
    }

    if (expected === null || expected === undefined) {
      statusCounts[COMPARISON_STATUS.NOT_AVAILABLE] += 1;
      catalogRows.push({
        ...field,
        elementName,
        property: field.key,
        expected: null,
        actual: actualValue,
        match: false,
        matchPercentage: null,
        gap: null,
        difference: formatDifference(field, null, actualValue, false, null, COMPARISON_STATUS.NOT_AVAILABLE),
        severity: 'none',
        status: COMPARISON_STATUS.NOT_AVAILABLE,
        evidence: `لا يوجد دليل مستخرج للحقل ${field.key} في مرجع (${refSourceLabel}).`,
        recommendation: buildRecommendation(field, null, actualValue, false, COMPARISON_STATUS.NOT_AVAILABLE),
      });
      continue;
    }

    let match = false;
    let gap = null;
    let status = COMPARISON_STATUS.MISMATCH;

    const customTolerance =
      options.tolerances?.[field.key] ??
      field.tolerance ??
      (typeof options.numericTolerance === 'number' ? options.numericTolerance : 1);

    if (field.kind === 'number') {
      const numActual = Number(actualValue);
      const numExpected = Number(expected);
      if (!Number.isFinite(numExpected)) {
        status = COMPARISON_STATUS.ERROR;
      } else if (actualValue !== null && Number.isFinite(numActual)) {
        gap = Math.round((numActual - numExpected) * 100) / 100;
        match = Math.abs(gap) <= customTolerance;
        status = match ? COMPARISON_STATUS.MATCH : COMPARISON_STATUS.MISMATCH;
      } else {
        match = false;
        status = COMPARISON_STATUS.MISMATCH;
      }
    } else if (field.kind === 'boolean') {
      match = actualValue === expected;
      status = match ? COMPARISON_STATUS.MATCH : COMPARISON_STATUS.MISMATCH;
    } else if (field.kind === 'color') {
      const normExp = normalizeHexColor(expected);
      const normAct = normalizeHexColor(actualValue);
      if (!normExp) {
        status = COMPARISON_STATUS.ERROR;
      } else {
        match = normExp === normAct;
        status = match ? COMPARISON_STATUS.MATCH : COMPARISON_STATUS.MISMATCH;
      }
    } else if (field.kind === 'fontWeight') {
      const normExp = normalizeFontWeightToken(expected);
      const normAct = normalizeFontWeightToken(actualValue);
      match = normExp !== null && normExp === normAct;
      status = match ? COMPARISON_STATUS.MATCH : COMPARISON_STATUS.MISMATCH;
    } else {
      match =
        actualValue !== null &&
        String(expected).trim().replace(/\s+/g, ' ') === String(actualValue).trim().replace(/\s+/g, ' ');
      status = match ? COMPARISON_STATUS.MATCH : COMPARISON_STATUS.MISMATCH;
    }

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const matchPercentage = computePropertyMatchPercentage(field, expected, actualValue, match, status);

    if (status !== COMPARISON_STATUS.ERROR) {
      comparableCount += 1;
      weightedTotal += field.weight;
      continuousEarned += field.weight * ((matchPercentage ?? 0) / 100);
      if (match) {
        earned += field.weight;
        passed++;
      }
      if (catBucket) {
        catBucket.total += 1;
        catBucket.weightTotal += field.weight;
        catBucket.continuousWeightEarned += field.weight * ((matchPercentage ?? 0) / 100);
        if (match) {
          catBucket.passed += 1;
          catBucket.weightEarned += field.weight;
        }
      }
    }

    const severity = status === COMPARISON_STATUS.ERROR ? 'high' : determineSeverity(field, match, gap);
    if (!match && severity !== 'none') {
      severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    }

    const row = {
      ...field,
      elementName,
      property: field.key,
      expected,
      actual: actualValue,
      match,
      matchPercentage,
      gap,
      difference: formatDifference(field, expected, actualValue, match, gap, status),
      severity,
      status,
      evidence: `مرجع Figma (${refSourceLabel}: ${expected}${field.unit || ''}) مقابل فحص React DOM (${actualValue ?? 'غير متاح'}${actualValue != null ? field.unit || '' : ''})`,
      recommendation: buildRecommendation(field, expected, actualValue, match, status),
    };

    rows.push(row);
    catalogRows.push(row);
  }

  const score = weightedTotal ? Math.round((10000 * earned) / weightedTotal) / 100 : null;
  const continuousScore = weightedTotal ? Math.round((10000 * continuousEarned) / weightedTotal) / 100 : null;
  const coveragePercentage = EXTENDED_FIELDS.length
    ? Math.round((10000 * comparableCount) / EXTENDED_FIELDS.length) / 100
    : 0;

  const categoryScores = [...categoryBuckets.values()]
    .filter(c => c.catalogCount > 0)
    .map(c => ({
      id: c.id,
      label: c.label,
      englishLabel: c.englishLabel,
      icon: c.icon,
      passed: c.passed,
      total: c.total,
      catalogCount: c.catalogCount,
      score: c.weightTotal > 0 ? Math.round((10000 * c.weightEarned) / c.weightTotal) / 100 : null,
      continuousScore:
        c.weightTotal > 0 ? Math.round((10000 * c.continuousWeightEarned) / c.weightTotal) / 100 : null,
      weightShare: weightedTotal > 0 ? Math.round((1000 * c.weightTotal) / weightedTotal) / 10 : 0,
    }));

  const exactPassRate = comparableCount ? Math.round((10000 * passed) / comparableCount) / 100 : 0;
  const mismatchRate = comparableCount
    ? Math.round((10000 * (comparableCount - passed)) / comparableCount) / 100
    : 0;

  return {
    score,
    continuousScore,
    passed,
    total: comparableCount,
    rows,
    catalogRows,
    categoryScores,
    overallPercentages: {
      propertyFidelity: score ?? 0,
      continuousProximity: continuousScore ?? 0,
      inspectionCoverage: coveragePercentage,
      exactPassRate,
      mismatchRate,
    },
    statusCounts,
    metricLabel: 'نسبة مطابقة الخصائص المفحوصة (Property Fidelity)',
    coverage: {
      tested: comparableCount,
      fieldsCount: fields.length,
      notAvailableCount: statusCounts[COMPARISON_STATUS.NOT_AVAILABLE],
      notComparableCount: statusCounts[COMPARISON_STATUS.NOT_COMPARABLE],
      errorCount: statusCounts[COMPARISON_STATUS.ERROR],
      percentage: coveragePercentage,
    },
    severityCounts,
    formula: FIDELITY_FORMULA,
    hasAuthenticVisualBaseline: Boolean(
      reference.previewSource === 'figma-plugin-export' ||
      reference.previewSource === 'figma-reader-screenshot' ||
      reference.previewSource === 'user-supplied-png'
    ),
  };
}
