import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateHtmlReport } from '../html/html-report-generator.mjs';

/**
 * Printable / PDF Report Generator:
 * Prepares print-optimized HTML and can render a real PDF file via headless Chromium when requested.
 */
export function buildPrintableHtmlReport(reportPayload = {}) {
  const html = generateHtmlReport(reportPayload);
  return html.replace(
    '</body>',
    `<script>if (location.search.includes('autoprint=1')) { window.addEventListener('load', () => window.print()); }</script></body>`
  );
}

export async function exportReportToPdfFile(reportPayload = {}, outputPdfPath = path.resolve('out', 'client-report.pdf')) {
  const html = generateHtmlReport(reportPayload);
  fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    });
    return {
      ok: true,
      pdfPath: outputPdfPath,
      byteLength: fs.statSync(outputPdfPath).size,
    };
  } finally {
    if (browser) await browser.close();
  }
}

