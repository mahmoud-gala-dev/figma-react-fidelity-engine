/**
 * Figma Fidelity Companion Plugin — Sandbox Core
 * Runs inside Figma Desktop Plugin Sandbox.
 * Extracts accurate node geometries, styles, typography, and genuine pixel snapshots.
 * Zero REST API, strictly uses official Figma Plugin API (figma.*).
 */

figma.showUI(__html__, { width: 380, height: 460, title: 'Figma Fidelity Companion' });

// Send current status on plugin launch
function notifyStatus() {
  const selection = figma.currentPage.selection;
  const selectedNode = selection[0] || null;

  figma.ui.postMessage({
    type: 'STATUS_UPDATE',
    payload: {
      documentName: figma.root.name,
      pageName: figma.currentPage.name,
      selectedCount: selection.length,
      selectedNodeId: selectedNode ? selectedNode.id : null,
      selectedNodeName: selectedNode ? selectedNode.name : null,
      selectedNodeType: selectedNode ? selectedNode.type : null
    }
  });
}

figma.on('selectionchange', () => {
  notifyStatus();
});

notifyStatus();

// Helper to convert Uint8Array to Base64 in sandbox
function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // In figma plugin sandbox, btoa might not be global, fallback provided
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Base64 encoding table
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    base64 += chars[b0 >> 2];
    base64 += chars[((b0 & 3) << 4) | (b1 >> 4)];
    base64 += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    base64 += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return base64;
}

// Extract rich properties from a Figma node
async function extractNodeData(targetNode) {
  if (!targetNode) return null;

  const box = {
    x: targetNode.x || 0,
    y: targetNode.y || 0,
    width: targetNode.width || 0,
    height: targetNode.height || 0
  };

  // Extract fills (colors)
  let fills = [];
  if ('fills' in targetNode && Array.isArray(targetNode.fills)) {
    fills = targetNode.fills.map(f => {
      if (f.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: { r: f.color.r, g: f.color.g, b: f.color.b },
          opacity: f.opacity !== undefined ? f.opacity : 1,
          visible: f.visible !== false
        };
      }
      return { type: f.type, visible: f.visible !== false };
    });
  }

  // Extract strokes
  let strokes = [];
  let strokeWeight = 0;
  let strokeAlign = 'INSIDE';
  if ('strokes' in targetNode && Array.isArray(targetNode.strokes)) {
    strokes = targetNode.strokes.map(s => {
      if (s.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: { r: s.color.r, g: s.color.g, b: s.color.b },
          opacity: s.opacity !== undefined ? s.opacity : 1,
          visible: s.visible !== false
        };
      }
      return { type: s.type };
    });
  }
  if ('strokeWeight' in targetNode) strokeWeight = targetNode.strokeWeight;
  if ('strokeAlign' in targetNode) strokeAlign = targetNode.strokeAlign;

  // Extract corner radius
  let cornerRadius = 0;
  if ('cornerRadius' in targetNode) {
    cornerRadius = targetNode.cornerRadius === figma.mixed ? 0 : targetNode.cornerRadius;
  }

  // Extract typography if text node or child has text
  let text = '';
  let fontStyle = {};
  if (targetNode.type === 'TEXT') {
    text = targetNode.characters;
    if (typeof targetNode.fontSize === 'number') fontStyle.fontSize = targetNode.fontSize;
    if (typeof targetNode.fontName === 'object' && targetNode.fontName !== figma.mixed) {
      fontStyle.fontFamily = targetNode.fontName.family;
      fontStyle.fontWeight = targetNode.fontName.style;
    }
    if (typeof targetNode.lineHeight === 'object' && targetNode.lineHeight !== figma.mixed) {
      if (targetNode.lineHeight.unit === 'PIXELS') fontStyle.lineHeightPx = targetNode.lineHeight.value;
      if (targetNode.lineHeight.unit === 'PERCENT') fontStyle.lineHeightPercent = targetNode.lineHeight.value;
    }
    if (targetNode.textAlignHorizontal) fontStyle.textAlignHorizontal = targetNode.textAlignHorizontal;
  } else if ('children' in targetNode && Array.isArray(targetNode.children)) {
    // Look for immediate text child
    const textChild = targetNode.children.find(c => c.type === 'TEXT');
    if (textChild) {
      text = textChild.characters;
      if (typeof textChild.fontSize === 'number') fontStyle.fontSize = textChild.fontSize;
      if (typeof textChild.fontName === 'object' && textChild.fontName !== figma.mixed) {
        fontStyle.fontFamily = textChild.fontName.family;
        fontStyle.fontWeight = textChild.fontName.style;
      }
    }
  }

  // AutoLayout properties
  let layoutMode = 'NONE';
  let itemSpacing = 0;
  let paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0;
  let primaryAxisAlignItems = 'MIN', counterAxisAlignItems = 'MIN';

  if ('layoutMode' in targetNode) {
    layoutMode = targetNode.layoutMode;
    itemSpacing = targetNode.itemSpacing || 0;
    paddingTop = targetNode.paddingTop || 0;
    paddingRight = targetNode.paddingRight || 0;
    paddingBottom = targetNode.paddingBottom || 0;
    paddingLeft = targetNode.paddingLeft || 0;
    primaryAxisAlignItems = targetNode.primaryAxisAlignItems || 'MIN';
    counterAxisAlignItems = targetNode.counterAxisAlignItems || 'MIN';
  }

  // Export genuine pixel snapshot (PNG @ 1x)
  let screenshotBase64 = null;
  try {
    const pngBytes = await targetNode.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 1 }
    });
    screenshotBase64 = bytesToBase64(pngBytes);
  } catch (err) {
    console.warn('Screenshot export failed:', err);
  }

  return {
    id: targetNode.id,
    name: targetNode.name,
    type: targetNode.type,
    width: targetNode.width,
    height: targetNode.height,
    absoluteBoundingBox: box,
    fills,
    strokes,
    strokeWeight,
    strokeAlign,
    cornerRadius,
    characters: text,
    style: fontStyle,
    layoutMode,
    itemSpacing,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    opacity: 'opacity' in targetNode ? targetNode.opacity : 1,
    visible: targetNode.visible,
    screenshotBase64
  };
}

// Handle messages from the plugin UI (iframe)
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'GET_STATUS') {
    notifyStatus();
  }

  if (msg.type === 'SYNC_REQUEST') {
    try {
      const requestedId = msg.nodeId ? String(msg.nodeId).replace(/-/g, ':') : null;
      let targetNode = null;

      // 1. Try finding requested node by ID if specified
      if (requestedId) {
        try {
          if (typeof figma.getNodeByIdAsync === 'function') {
            targetNode = await figma.getNodeByIdAsync(requestedId);
          } else if (typeof figma.getNodeById === 'function') {
            targetNode = figma.getNodeById(requestedId);
          }
        } catch (e) {
          console.warn('Node lookup by ID failed, falling back to selection', e);
        }
      }

      // 2. Fallback to active selection if not found or no ID requested
      if (!targetNode) {
        targetNode = figma.currentPage.selection[0] || null;
      }

      // 3. Fallback to first top-level child of current page
      if (!targetNode && figma.currentPage.children.length > 0) {
        targetNode = figma.currentPage.children[0];
      }

      if (!targetNode) {
        figma.ui.postMessage({
          type: 'SYNC_ERROR',
          error: 'لم يتم العثور على أي عنصر في الصفحة أو التحديد الحالي.'
        });
        return;
      }

      // Extract node and screenshot
      const nodeData = await extractNodeData(targetNode);

      figma.ui.postMessage({
        type: 'SYNC_SUCCESS',
        payload: {
          documentName: figma.root.name,
          pageName: figma.currentPage.name,
          fileKey: msg.fileKey || null,
          nodeId: targetNode.id,
          node: nodeData,
          screenshotBase64: nodeData.screenshotBase64
        }
      });
    } catch (err) {
      figma.ui.postMessage({
        type: 'SYNC_ERROR',
        error: 'فشل استخراج بيانات العنصر: ' + err.message
      });
    }
  }
};

