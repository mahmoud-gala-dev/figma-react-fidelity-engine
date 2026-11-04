/** Official Figma URL parsing only. Parsing does not fetch or authorize a design. */
export { parseFigmaLink } from '../../lib/figma-link.mjs';
import { parseFigmaLink } from '../../lib/figma-link.mjs';

export const parseFigmaUrl = parseFigmaLink;

export function assertSyncableDesignUrl(value) {
  const parsed = parseFigmaLink(value);
  if (parsed.kind === 'board') {
    const error = new Error('رابط FigJam غير مدعوم في المزامنة. افتح ملف Figma Design وانسخ رابطه من المتصفح.');
    error.code = 'unsupported_document';
    throw error;
  }
  if (!parsed.nodeId) {
    const error = new Error('الرابط بلا node-id. في Figma اختر الإطار أو المكوّن ثم Copy link to selection وألصق الرابط من جديد.');
    error.code = 'missing_node';
    throw error;
  }
  return parsed;
}
