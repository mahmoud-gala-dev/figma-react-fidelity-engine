import fs from 'node:fs';
import path from 'node:path';
import { importFigDocument } from '../figma/figma-sync-service.mjs';
import {
  compareReaderAndOpenFigOutputs,
  normalizeOpenFigToCanonical,
} from '../../design/normalizer/design-normalizer.mjs';
import { createCanonicalNode, finiteOrNull } from '../../design/schema/canonical-schema.mjs';

export const OPENFIG_TOOL_INFO = Object.freeze({
  name: 'openfig-core',
  version: '0.4.1',
  role: 'FALLBACK (.fig Binary Parser)',
  repository: 'https://github.com/OpenFig-org/openfig-core',
});

/**
 * Fallback & offline .fig parser using openfig-core.
 * Preserves existing importFigDocument while enriching canonical nodes with AutoLayout and child text tokens.
 */
export class OpenFigAdapter {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
  }

  async parseFigBytes(bytes, { nodeId = null, nodeName = null, fileName = 'design.fig' } = {}) {
    // Call existing importFigDocument for validation and index extraction
    const imported = await importFigDocument(bytes, { nodeId, nodeName, fileName });

    // Also parse via openfig-core to extract full AutoLayout & child text properties into Canonical Design Schema
    const { parseFig, nodeId: toId } = await import('openfig-core');
    const doc = parseFig(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const rawNodes = (doc.nodes || []).filter(n => n?.phase !== 'REMOVED');

    const wantedId = imported.ref?.nodeId || (nodeId ? String(nodeId).replace(/-/g, ':') : null);
    const targetRaw =
      rawNodes.find(n => toId(n) === wantedId) ||
      rawNodes.find(n => n.name === nodeName) ||
      rawNodes[0];

    let canonicalRef;
    if (targetRaw) {
      const id = toId(targetRaw);
      // Find first child TEXT node whose parentIndex.guid matches targetRaw.guid
      const childTextRaw = rawNodes.find(n => {
        if (n.type !== 'TEXT') return false;
        const pGuid = n.parentIndex?.guid;
        return pGuid && `${pGuid.sessionID}:${pGuid.localID}` === id;
      });
      const baseCanonical = normalizeOpenFigToCanonical(targetRaw, {
        nodeId: id,
        fileName,
        acquiredAt: new Date().toISOString(),
      });
      if (childTextRaw && !baseCanonical.text) {
        canonicalRef = createCanonicalNode({
          ...baseCanonical,
          text: typeof childTextRaw.textData?.characters === 'string' ? childTextRaw.textData.characters : null,
          fontFamily: childTextRaw.fontName?.family || baseCanonical.fontFamily,
          fontWeight: childTextRaw.fontName?.style ? String(childTextRaw.fontName.style) : baseCanonical.fontWeight,
          fontSize: finiteOrNull(childTextRaw.fontSize) ?? baseCanonical.fontSize,
          lineHeight: finiteOrNull(childTextRaw.lineHeight?.value) ?? baseCanonical.lineHeight,
        });
      } else {
        canonicalRef = baseCanonical;
      }
    } else {
      canonicalRef = createCanonicalNode({
        ...imported.ref,
        source: 'openfig-core-native',
        sourceName: fileName,
        acquiredAt: new Date().toISOString(),
      });
    }

    const pages = imported.index.filter(n => n.type === 'CANVAS' || n.type === 'PAGE');
    const frames = imported.index.filter(n => ['FRAME', 'GROUP', 'SECTION'].includes(n.type));
    const components = imported.index.filter(n => ['COMPONENT', 'SYMBOL', 'COMPONENT_SET', 'INSTANCE'].includes(n.type));

    return {
      ok: true,
      adapter: 'openfig-core',
      source: 'openfig-core-native',
      fileName,
      selectedNodeId: canonicalRef.nodeId,
      ref: canonicalRef,
      index: imported.index,
      hierarchy: {
        pages,
        frames,
        components,
        allNodes: imported.index,
      },
      limited: imported.limited,
      parsedCount: imported.parsedCount,
    };
  }

  async parseFigFile(filePath, { nodeId = null, nodeName = null } = {}) {
    const resolved = path.resolve(this.cwd, filePath);
    const rel = path.relative(this.cwd, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('مسار ملف .fig خارج مجلد المشروع المسموح.');
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`ملف .fig غير موجود: ${rel}`);
    }
    const bytes = fs.readFileSync(resolved);
    return this.parseFigBytes(bytes, {
      nodeId,
      nodeName,
      fileName: path.basename(resolved),
    });
  }

  /**
   * Compares OpenFig Core output against figma-reader output on a shared .fig fixture.
   */
  async compareWithFigmaReader(figmaReaderAdapter, {
    figPath = 'fixtures/sample-design.fig',
    nodeId = '942:2734',
  } = {}) {
    const openFigResult = await this.parseFigFile(figPath, { nodeId });
    const readerResult = await figmaReaderAdapter.getNode(figPath, { nodeId });
    const comparison = compareReaderAndOpenFigOutputs(readerResult.canonical, openFigResult.ref);
    return {
      fixture: figPath,
      nodeId,
      figmaReaderNode: readerResult.canonical,
      openFigNode: openFigResult.ref,
      comparison,
    };
  }
}

export { normalizeOpenFigToCanonical };

