import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import { importFigmaExportZip } from './src/lib/import-design.mjs';

// Local-only cache bridge. Never contacts Figma cloud or uses Figma REST API.
function authorizedLocalExports() {
  return {
    name: 'figma-local-export-cache', configureServer(server) {
      server.middlewares.use('/api/local-figma-export', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
        if (req.method !== 'GET') return reply(405, { error: 'Method not allowed' });
        const params = new URL(req.url, 'http://localhost').searchParams;
        const fileKey = params.get('fileKey');
        const nodeId = params.get('nodeId') || null;
        if (!/^[a-zA-Z0-9]{8,}$/.test(fileKey || '')) return reply(400, { error: 'Invalid Figma file key' });
        if (nodeId && !/^\d+:\d+$/.test(nodeId)) return reply(400, { error: 'Invalid node ID' });
        const dir = path.join(process.cwd(), 'input', 'figma-exports');
        let files = [];
        try { files = (await fs.readdir(dir)).filter(n => n.toLowerCase().endsWith('.zip')); }
        catch (e) { if (e.code !== 'ENOENT') return reply(500, { error: e.message }); }
        const ranked = await Promise.all(files.slice(0, 100).map(async name => {
          const full = path.join(dir, name); const s = await fs.stat(full); return { full, time: s.mtimeMs, size: s.size, name };
        }));
        ranked.sort((a, b) => b.time - a.time);
        for (const f of ranked) {
          if (f.size > 50_000_000) continue;
          try { const bytes = await fs.readFile(f.full); const result = importFigmaExportZip(bytes, { fileKey, nodeId }); return reply(200, { ...result, localFile: f.name }); }
          catch (e) { if (String(e.message).includes('العنصر') && String(e.message).includes('غير موجود')) return reply(422, { error: e.message, localFile: f.name }); }
        }
        reply(404, { error: 'لا يوجد تصدير Full مطابق لهذا الرابط في input/figma-exports. افتح Figma Export، ثم ضع ملف ZIP هنا.' });
      });
    }
  };
}
export default defineConfig({ plugins: [react(), authorizedLocalExports()], server: { port: 5173, strictPort: true, host: '127.0.0.1' } });
