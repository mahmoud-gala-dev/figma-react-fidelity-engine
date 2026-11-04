/** Visible local download: Main menu → File → Save local copy. Does not print design text. */
import { FigmaBrowserDownloader } from '../src/integrations/figma/figma-browser-downloader.mjs';

const url = process.argv[2] || process.env.FIGMA_URL;
if (!url) {
  console.error('Usage: node scripts/download-figma.mjs <figma-design-url>');
  process.exit(2);
}

const downloader = new FigmaBrowserDownloader({
  loginTimeoutMs: Number(process.env.FIGMA_LOGIN_TIMEOUT_MS || 45000),
});
const started = Date.now();
try {
  const result = await downloader.download(url);
  const missing = result.ref?.missingAttributes?.length ?? null;
  console.log(JSON.stringify({
    ok: true,
    figPath: result.figPath,
    byteLength: result.byteLength,
    nodeId: result.nodeId,
    nodeType: result.ref?.nodeType || null,
    parsedCount: result.parsedCount || null,
    missingCount: missing,
    elapsedMs: Date.now() - started,
  }));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    reason: error.reason || 'download_failed',
    message: error.message,
    recovery: error.recovery || '',
    elapsedMs: Date.now() - started,
  }));
  process.exit(1);
}
