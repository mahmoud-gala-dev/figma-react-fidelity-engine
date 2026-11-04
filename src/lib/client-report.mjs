import { generateHtmlReport, generateJsonReport } from '../reports/html/html-report-generator.mjs';

export function buildClientReport(payload = {}) {
  return generateHtmlReport(payload);
}

export { generateHtmlReport, generateJsonReport };
