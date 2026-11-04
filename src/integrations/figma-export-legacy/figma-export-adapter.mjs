import fs from 'node:fs';
import path from 'node:path';
import { importFigmaExportZip, importJsonObject } from '../../lib/import-design.mjs';
import { normalizeExportNode, findInExportTree } from '../../lib/export-adapter.mjs';
import { createCanonicalNode } from '../../design/schema/canonical-schema.mjs';

/**
 * Upstream audit disclosure for Tool 3 (Figma Export):
 * The user explicitly does NOT require Figma plugins in the primary workflow.
 * This adapter is strictly OPTIONAL / LEGACY for importing previously exported ZIP/JSON bundles.
 */
export const FIGMA_EXPORT_LEGACY_INFO = Object.freeze({
  name: 'figma-export-legacy',
  classification: 'OPTIONAL / LEGACY',
  mandatoryInPrimaryWorkflow: false,
  requiresPluginInstallation: false,
  requiresPairingCodes: false,
  upstreamRepository: 'https://github.com/Baolv/figma-export',
  upstreamStatus: 'UNAVAILABLE_OR_REMOVED (HTTP 404 on public GitHub; local ZIP parser preserved via fflate for backward compatibility with existing ZIP exports)',
  localImplementation: 'src/lib/export-adapter.mjs + fflate@0.8.2 (MIT License)',
});

export class FigmaExportLegacyAdapter {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
  }

  importZipBytes(bytes, { nodeId = null, nodeName = null, fileName = 'figma-export.zip' } = {}) {
    const imported = importFigmaExportZip(bytes, { nodeId, nodeName });
    const canonicalRef = createCanonicalNode({
      ...imported.ref,
      source: 'figma-export-zip-legacy',
      sourceName: fileName,
      acquiredAt: new Date().toISOString(),
    });
    return {
      ok: true,
      adapter: 'figma-export-legacy',
      classification: 'OPTIONAL / LEGACY',
      fileName,
      selectedNodeId: canonicalRef.nodeId,
      ref: canonicalRef,
      index: imported.index,
      hierarchy: {
        pages: imported.index.filter(n => n.type === 'CANVAS' || n.type === 'PAGE'),
        frames: imported.index.filter(n => ['FRAME', 'GROUP', 'SECTION'].includes(n.type)),
        components: imported.index.filter(n => ['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(n.type)),
        allNodes: imported.index,
      },
      previewDataUrl: imported.previewDataUrl || null,
      screenshotBytes: imported.screenshotBytes || null,
      disclosure: FIGMA_EXPORT_LEGACY_INFO,
    };
  }

  importZipFile(filePath, { nodeId = null, nodeName = null } = {}) {
    const resolved = path.resolve(this.cwd, filePath);
    const rel = path.relative(this.cwd, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('مسار ملف ZIP خارج مجلد المشروع المسموح.');
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`ملف ZIP غير موجود: ${rel}`);
    }
    const bytes = fs.readFileSync(resolved);
    return this.importZipBytes(bytes, {
      nodeId,
      nodeName,
      fileName: path.basename(resolved),
    });
  }

  importJson(jsonObject, sourceName = 'JSON Import (Legacy)') {
    const imported = importJsonObject(jsonObject, sourceName);
    const canonicalRef = createCanonicalNode({
      ...imported.ref,
      source: 'figma-plugin-json',
      sourceName,
      acquiredAt: new Date().toISOString(),
    });
    return {
      ok: true,
      adapter: 'figma-export-legacy',
      classification: 'OPTIONAL / LEGACY',
      selectedNodeId: canonicalRef.nodeId,
      ref: canonicalRef,
      index: imported.index,
    };
  }
}

export { normalizeExportNode, findInExportTree };

