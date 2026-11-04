/**
 * Figma Version & Revision Tracker
 * Detects real changes between consecutive syncs from Figma.
 * Identifies modified dimensions, styling, typography, and text between revisions.
 */

const TRACKED_FIELDS = [
  { key: 'width', label: 'العرض' },
  { key: 'height', label: 'الارتفاع' },
  { key: 'backgroundColor', label: 'لون الخلفية' },
  { key: 'borderRadius', label: 'استدارة الزوايا' },
  { key: 'text', label: 'النص' },
  { key: 'fontSize', label: 'حجم الخط' },
  { key: 'fontFamily', label: 'نوع الخط' },
  { key: 'fontWeight', label: 'وزن الخط' },
  { key: 'borderColor', label: 'لون الإطار' },
  { key: 'borderWidth', label: 'سمك الإطار' },
  { key: 'opacity', label: 'الشفافية' }
];

export function fingerprintReference(ref) {
  if (!ref || typeof ref !== 'object') return {};
  const fp = {};
  for (const { key } of TRACKED_FIELDS) {
    fp[key] = ref[key] ?? null;
  }
  return fp;
}

export function diffRevisions(prev, curr) {
  if (!prev || typeof prev !== 'object') {
    return { changed: false, fields: [], count: 0, summary: 'المزامنة الأولى (لا توجد نسخة سابقة للمقارنة)' };
  }
  if (!curr || typeof curr !== 'object') {
    return { changed: false, fields: [], count: 0, summary: 'بيانات غير صالحة' };
  }

  const fields = [];
  for (const f of TRACKED_FIELDS) {
    const v1 = prev[f.key];
    const v2 = curr[f.key];
    const isDiff = typeof v1 === 'number' && typeof v2 === 'number'
      ? Math.abs(v1 - v2) > 0.01
      : String(v1 ?? '').trim() !== String(v2 ?? '').trim();

    if (isDiff) {
      fields.push({
        key: f.key,
        label: f.label,
        from: v1 ?? 'غير محدد',
        to: v2 ?? 'غير محدد'
      });
    }
  }

  const summary = fields.length > 0
    ? `تم رصد تعديل في ${fields.length} خصائص: ${fields.map(c => c.label).join('، ')}`
    : 'لا توجد تغييرات هندسية أو بصرية عن النسخة السابقة';

  return {
    changed: fields.length > 0,
    fields,
    count: fields.length,
    summary
  };
}

export class FigmaVersionTracker {
  constructor() {
    this.revisions = new Map();
  }

  getLookupKey(fileKey, nodeId) {
    return `${fileKey || 'global'}::${nodeId || 'default'}`;
  }

  recordSync(fileKey, nodeId, normalizedData) {
    const key = this.getLookupKey(fileKey, nodeId);
    const existing = this.revisions.get(key) || [];
    const previous = existing[existing.length - 1] || null;

    const currentEntry = {
      timestamp: new Date().toISOString(),
      data: normalizedData
    };

    const delta = previous ? diffRevisions(previous.data, normalizedData) : null;

    existing.push(currentEntry);
    if (existing.length > 20) existing.shift();
    this.revisions.set(key, existing);

    return {
      hasChanged: delta ? delta.changed : false,
      delta,
      revisionNumber: existing.length,
      previousTimestamp: previous ? previous.timestamp : null
    };
  }

  getHistory(fileKey, nodeId) {
    const key = this.getLookupKey(fileKey, nodeId);
    return this.revisions.get(key) || [];
  }
}

export const globalVersionTracker = new FigmaVersionTracker();
