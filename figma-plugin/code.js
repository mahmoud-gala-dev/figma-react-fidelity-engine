/* Local connector. Reads only the file the user already opened. No Figma REST API. */
var ENDPOINT = 'http://localhost:5173';
var revision = '1';

figma.on('documentchange', function () {
  revision = String(Number(revision) + 1);
});

figma.clientStorage.getAsync('pairingToken').then(function (saved) {
  figma.showUI(__html__, { width: 380, height: 520, themeColors: true });
  figma.ui.postMessage({ type: 'init', token: saved || '', endpoint: ENDPOINT });
});

function hexFrom(color) {
  if (!color) return null;
  var channel = function (value) { return Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0'); };
  return ('#' + channel(color.r) + channel(color.g) + channel(color.b)).toUpperCase();
}

function serialize(node, depth, state) {
  if (!node || depth > 6 || state.count >= 300) { state.truncated = true; return null; }
  state.count += 1;
  var unsupported = [];
  var backgroundColor = null;
  var imagePresent = false;
  if (node.fills && node.fills !== figma.mixed && Array.isArray(node.fills)) {
    var solid = node.fills.find(function (paint) { return paint.visible !== false && paint.type === 'SOLID'; });
    if (solid) backgroundColor = hexFrom(solid.color);
    imagePresent = node.fills.some(function (paint) { return paint.type === 'IMAGE'; });
  } else if ('fills' in node && node.fills === figma.mixed) unsupported.push('mixed-fills');
  var borderColor = null;
  var borderWidth = null;
  if (node.strokes && node.strokes !== figma.mixed && node.strokes.length && typeof node.strokeWeight === 'number') {
    var stroke = node.strokes.find(function (paint) { return paint.visible !== false && paint.type === 'SOLID'; });
    if (stroke) { borderColor = hexFrom(stroke.color); borderWidth = node.strokeWeight; }
    if (node.strokeAlign && node.strokeAlign !== 'INSIDE') unsupported.push('stroke-align-' + node.strokeAlign);
  } else if (node.strokeWeight === figma.mixed) unsupported.push('mixed-stroke');
  var borderRadius = null;
  if (typeof node.cornerRadius === 'number') borderRadius = node.cornerRadius;
  else if (node.cornerRadius === figma.mixed) unsupported.push('mixed-radius');
  var out = {
    id: node.id, name: node.name, type: node.type, visible: node.visible !== false,
    opacity: typeof node.opacity === 'number' ? node.opacity : null,
    width: 'width' in node ? node.width : null, height: 'height' in node ? node.height : null,
    x: 'x' in node ? node.x : null, y: 'y' in node ? node.y : null,
    backgroundColor: backgroundColor, borderColor: borderColor, borderWidth: borderWidth, borderRadius: borderRadius,
    imagePresent: imagePresent, text: node.type === 'TEXT' ? node.characters : null,
    fontSize: node.type === 'TEXT' && node.fontSize !== figma.mixed ? node.fontSize : null,
    fontFamily: node.type === 'TEXT' && node.fontName !== figma.mixed ? node.fontName.family : null,
    fontWeight: node.type === 'TEXT' && node.fontName !== figma.mixed ? node.fontName.style : null,
    lineHeight: null,
    paddingTop: 'paddingTop' in node ? node.paddingTop : null,
    paddingRight: 'paddingRight' in node ? node.paddingRight : null,
    paddingBottom: 'paddingBottom' in node ? node.paddingBottom : null,
    paddingLeft: 'paddingLeft' in node ? node.paddingLeft : null,
    layoutMode: 'layoutMode' in node ? node.layoutMode : null,
    primaryAxisAlign: node.primaryAxisAlignItems || null,
    counterAxisAlign: node.counterAxisAlignItems || null,
    componentName: null, variant: null, unsupported: unsupported, children: []
  };
  if (node.type === 'TEXT' && node.lineHeight && node.lineHeight !== figma.mixed) {
    if (node.lineHeight.unit === 'PIXELS') out.lineHeight = node.lineHeight.value;
    else unsupported.push('line-height-' + node.lineHeight.unit);
  } else if (node.type === 'TEXT' && node.fontSize === figma.mixed) unsupported.push('mixed-text-style');
  if (node.type === 'INSTANCE') {
    try {
      out.componentName = node.mainComponent ? node.mainComponent.name : null;
      if (node.variantProperties) out.variant = Object.keys(node.variantProperties).map(function (key) { return key + '=' + node.variantProperties[key]; }).join(', ');
    } catch (error) { unsupported.push('component-unavailable'); }
  }
  if ('children' in node && Array.isArray(node.children)) {
    node.children.forEach(function (child) {
      if (state.count >= 300) return;
      var next = serialize(child, depth + 1, state);
      if (next) out.children.push(next);
    });
  }
  if (state.truncated) unsupported.push('tree-truncated');
  return out;
}

async function buildIndex() {
  if (figma.loadAllPagesAsync) await figma.loadAllPagesAsync();
  var index = [];
  figma.root.children.forEach(function (page) {
    index.push({ id: page.id, name: page.name, type: page.type, pageName: page.name });
    var children = [];
    try { children = page.children || []; } catch (error) { children = []; }
    children.forEach(function (child) {
      if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'INSTANCE', 'GROUP'].indexOf(child.type) >= 0) {
        index.push({ id: child.id, name: child.name, type: child.type, pageName: page.name });
      }
    });
  });
  return index.slice(0, 400);
}

async function resolveNode(nodeId) {
  if (figma.loadAllPagesAsync) await figma.loadAllPagesAsync();
  if (!nodeId) {
    var selected = figma.currentPage.selection[0];
    if (!selected) {
      var missing = new Error('الرابط بلا node-id ولا يوجد عنصر محدد في Figma. استخدم Copy link to selection.');
      missing.reason = 'missing_node';
      throw missing;
    }
    return selected;
  }
  var node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(nodeId) : figma.getNodeById(nodeId);
  if (!node) {
    var absent = new Error('العنصر ' + nodeId + ' غير موجود في الملف المفتوح.');
    absent.reason = 'missing_node';
    throw absent;
  }
  return node;
}

figma.ui.onmessage = async function (msg) {
  if (msg.type === 'save-token') {
    await figma.clientStorage.setAsync('pairingToken', msg.token || '');
    figma.ui.postMessage({ type: 'token-saved' });
    return;
  }
  if (msg.type === 'context') {
    figma.ui.postMessage({ type: 'context', fileKey: figma.fileKey || '', fileName: figma.root.name, editorType: figma.editorType, revision: revision });
    return;
  }
  if (msg.type !== 'export') return;
  try {
    if (figma.editorType !== 'figma') {
      figma.ui.postMessage({ type: 'fail', jobId: msg.job.id, reason: 'unsupported_document', message: 'هذه الإضافة تدعم ملفات Figma Design فقط.' });
      return;
    }
    if (!figma.fileKey) {
      figma.ui.postMessage({ type: 'fail', jobId: msg.job.id, reason: 'sync_failed', message: 'الملف المفتوح بلا مفتاح. احفظه في Figma ثم أعد المزامنة.' });
      return;
    }
    if (figma.fileKey !== msg.job.fileKey) {
      figma.ui.postMessage({ type: 'fail', jobId: msg.job.id, reason: 'permission_denied', message: 'الملف المفتوح لا يطابق الرابط المطلوب.' });
      return;
    }
    var node = await resolveNode(msg.job.nodeId);
    var state = { count: 0, truncated: false };
    var tree = serialize(node, 0, state);
    var imageBase64 = null;
    var previewNote = '';
    try {
      if (node.type === 'PAGE' || node.type === 'DOCUMENT' || typeof node.exportAsync !== 'function') {
        previewNote = 'لم تُصدَّر صورة للصفحة كاملة. اختر إطارًا أو مكوّنًا للحصول على مرجع بصري.';
      } else {
        var bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
        if (bytes.length > 3500000) previewNote = 'صورة العقدة أكبر من 3.5MB ولم تُرسل. الخصائص وصلت دون مرجع بصري.';
        else imageBase64 = figma.base64Encode(bytes);
      }
    } catch (error) { previewNote = 'تعذر تصدير PNG لهذه العقدة: ' + error.message; }
    figma.ui.postMessage({
      type: 'exported', jobId: msg.job.id, fileKey: figma.fileKey, fileName: figma.root.name,
      editorType: figma.editorType, revision: revision, node: tree, index: await buildIndex(),
      imageBase64: imageBase64, previewNote: previewNote
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'fail', jobId: msg.job.id, reason: error.reason || 'sync_failed', message: error.message || 'فشلت القراءة من Figma.' });
  }
};
