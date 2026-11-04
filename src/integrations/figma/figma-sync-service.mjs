import { normalizeOpenFigNode, normalizePluginNode } from './figma-normalizer.mjs';
import { diffRevisions, fingerprintReference } from './figma-version-tracker.mjs';
import { decodePngBase64 } from './figma-asset-manager.mjs';

const KEY_RE = /^[a-zA-Z0-9]{8,128}$/;
const ID_RE = /^[A-Za-z0-9:;_-]{1,80}$/;

export function assertFileKey(fileKey) {
  if (!KEY_RE.test(fileKey || '')) throw Object.assign(new Error('مفتاح ملف Figma غير صالح.'), { status: 400 });
  return fileKey;
}

export function assertNodeId(nodeId) {
  if (!ID_RE.test(nodeId || '')) throw Object.assign(new Error('معرّف العقدة غير صالح. انسخ الرابط من Copy link to selection.'), { status: 400 });
  return nodeId;
}

export function validatePluginTree(node, depth = 0, acc = { n: 0 }) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('شجرة العقدة غير صالحة.');
  if (depth > 8) throw new Error('شجرة التصميم أعمق من الحد المسموح. اختر إطارًا أصغر.');
  acc.n += 1;
  if (acc.n > 300) throw new Error('عدد العقد أكبر من 300. اختر إطارًا أو مكوّنًا أصغر.');
  for (const key of Object.keys(node)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('حقل غير مسموح في بيانات الإضافة.');
  }
  if (node.id != null && !ID_RE.test(String(node.id))) throw new Error('معرّف عقدة داخل الشجرة غير صالح.');
  if (node.name != null && (typeof node.name !== 'string' || node.name.length > 500)) throw new Error('اسم عقدة غير صالح.');
  if (node.text != null && (typeof node.text !== 'string' || node.text.length > 8000)) throw new Error('نص العقدة أطول من الحد المسموح.');
  if (node.children != null) {
    if (!Array.isArray(node.children) || node.children.length > 200) throw new Error('قائمة الأبناء غير صالحة.');
    for (const child of node.children) validatePluginTree(child, depth + 1, acc);
  }
  return node;
}

export function acceptPluginPayload(payload, previousRevision) {
  if (!payload || typeof payload !== 'object') throw new Error('نتيجة الإضافة فارغة.');
  assertFileKey(payload.fileKey);
  validatePluginTree(payload.node);
  const ref = normalizePluginNode(payload.node, {
    fileKey: payload.fileKey,
    fileName: typeof payload.fileName === 'string' ? payload.fileName.slice(0, 200) : 'Figma Desktop',
    editorType: payload.editorType,
    revision: typeof payload.revision === 'string' ? payload.revision.slice(0, 64) : null,
    exportedAt: new Date().toISOString(),
    previewSource: payload.imageBase64 ? 'figma-plugin-export' : null,
  });
  const index = Array.isArray(payload.index)
    ? payload.index.filter(item => item && ID_RE.test(String(item.id || '')) && typeof item.name === 'string').slice(0, 400).map(item => ({ id: String(item.id), name: item.name.slice(0, 200), type: String(item.type || 'UNKNOWN').slice(0, 40), pageName: typeof item.pageName === 'string' ? item.pageName.slice(0, 200) : '' }))
    : [];
  const png = payload.imageBase64 ? decodePngBase64(payload.imageBase64) : null;
  const current = fingerprintReference(ref);
  return {
    ref, index, png, change: diffRevisions(previousRevision, current), current,
    previewNote: typeof payload.previewNote === 'string' ? payload.previewNote.slice(0, 300) : '',
    resolvedNodeId: payload.node.id,
  };
}

export async function importFigDocument(bytes, { nodeId = null, nodeName = null, fileName = 'design.fig' } = {}) {
  if (!bytes || bytes.byteLength > 50_000_000) throw new Error('ملف .fig أكبر من 50MB.');
  const { parseFig, nodeId: toId } = await import('openfig-core');
  let doc;
  try { doc = parseFig(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }
  catch (error) { throw new Error(`تعذر قراءة ملف .fig. الملف تالف أو بصيغة لا يدعمها OpenFig: ${error.message}`); }
  const nodes = [];
  for (const node of doc.nodes || []) {
    if (node?.phase === 'REMOVED') continue;
    const id = toId(node);
    if (!id) continue;
    nodes.push(normalizeOpenFigNode(node, { nodeId: id, fileName }));
    if (nodes.length >= 200) break;
  }
  if (!nodes.length) throw new Error('OpenFig لم يستخرج عقدًا قابلة للمقارنة. لا تدّعِ أن الملف متوافق بالكامل.');
  const wanted = nodeId ? String(nodeId).replace(/-/g, ':') : null;
  const ref = (wanted && nodes.find(item => item.nodeId === wanted))
    || (nodeName && nodes.find(item => item.nodeName === nodeName))
    || nodes.find(item => item.width != null)
    || nodes[0];
  if (wanted && ref.nodeId !== wanted) throw new Error(`العنصر ${wanted} غير موجود في ملف .fig. اختر معرّفًا من القائمة بعد استيراد بلا node-id.`);
  return {
    ref,
    index: nodes.map(item => ({ id: item.nodeId, name: item.nodeName, type: item.nodeType })),
    limited: (doc.nodes || []).length > nodes.length,
    parsedCount: (doc.nodes || []).length,
  };
}
