import { unzipSync, strFromU8 } from 'fflate';
import { findInExportTree, normalizeExportNode } from './export-adapter.mjs';
import { normalizeJsonNode } from './compare.mjs';

const isValidNode = n => n && typeof n === 'object' && typeof n.id === 'string';

export function selectJsonNode(root, nodeId = null) {
  const tree = root?.document || root?.tree || root?.node || null;
  if (!tree) throw new Error('JSON غير مدعوم: يلزم وجود document أو tree.');
  const requested = nodeId ? String(nodeId).replace(/-/g, ':') : null;
  if (requested) {
    const chosen = findInExportTree(tree, { id: requested });
    if (!chosen) throw new Error(`العنصر ${requested} غير موجود في الملف. استخدم رابطًا لعنصر مُصدَّر.`);
    return chosen;
  }
  const demo = findInExportTree(tree, { name: 'Buy ice cream' });
  if (demo) return demo;
  const stack = [tree];
  while (stack.length) {
    const n = stack.shift();
    if (isValidNode(n) && n !== tree && (n.absoluteBoundingBox || n.box)) return n;
    if (Array.isArray(n?.children)) stack.push(...n.children);
  }
  throw new Error('لا يوجد عنصر مناسب للمقارنة داخل JSON.');
}

export function importJsonObject(root, {nodeId=null, fileName='Figma JSON'}={}) {
  const picked = selectJsonNode(root,nodeId);
  const result = root?.document ? normalizeJsonNode(picked,root) : normalizeExportNode(picked,{fileName});
  return {ref:result,sourceType:'json',selectedId:picked.id};
}

function formsOf(id) {
  const raw = String(id);
  return { colon: raw.replace(/-/g, ':'), hyphen: raw.replace(/:/g, '-') };
}

export function isDeltaChanges(changes) {
  return changes?.mode === 'delta' || changes?.exportMode === 'delta';
}

function deltaIds(changes, key) {
  const list = Array.isArray(changes?.[key]) ? changes[key] : [];
  return list.map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
}

function viewHint(nodeIndex, nodeId) {
  if (!nodeIndex || !nodeId) return null;
  const table = nodeIndex.nodes && typeof nodeIndex.nodes === 'object' ? nodeIndex.nodes : nodeIndex;
  const forms = formsOf(nodeId);
  const hit = table[forms.colon] || table[forms.hyphen] || table[nodeId];
  if (typeof hit === 'string') return hit;
  if (hit && typeof hit.view === 'string') return hit.view;
  if (hit && typeof hit.viewFile === 'string') return hit.viewFile;
  return null;
}

function sideFile(readJson, name) {
  const value = readJson(name);
  if (!value) return { present: false };
  const encoded = JSON.stringify(value);
  if (encoded.length > 200_000) return { present: true, omitted: 'large' };
  return { present: true, data: value };
}

function findPreview(entries, selected, viewName) {
  const hyphen = formsOf(selected.id).hyphen;
  const component = entries.find(([name]) => name.endsWith(`components/${hyphen}.png`));
  if (component && component[1][0] === 0x89 && component[1].length <= 1_500_000) return { bytes: component[1], kind: 'component' };
  const viewRoot = viewName && (viewName.endsWith(`/${hyphen}.json`) || viewName.endsWith(`${hyphen}.json`));
  const viewPng = entries.find(([name]) => name.endsWith(`views/${hyphen}.png`));
  if (viewRoot && viewPng && viewPng[1][0] === 0x89 && viewPng[1].length <= 1_500_000) return { bytes: viewPng[1], kind: 'view' };
  return null;
}

function collectIndex(viewMap) {
  const index = [];
  for (const parsed of Object.values(viewMap)) {
    const tree = parsed?.tree || parsed;
    const stack = tree ? [tree] : [];
    while (stack.length && index.length < 400) {
      const node = stack.pop();
      if (node?.id && node.name) index.push({ id: node.id, name: node.name, type: node.type || 'UNKNOWN' });
      if (Array.isArray(node?.children)) stack.push(...node.children);
    }
  }
  return index;
}

/** Decode an authorized plugin ZIP; no Figma network calls are made. */
export function importFigmaExportZip(raw, { fileKey = null, nodeId = null, nodeName = null, baseline = null } = {}) {
  if (!raw || raw.byteLength > 50_000_000) throw new Error('ملف ZIP كبير جدًا (الحد 50MB).');
  let zip;
  try { zip = unzipSync(raw instanceof Uint8Array ? raw : new Uint8Array(raw)); }
  catch { throw new Error('تعذر فتح ZIP. تأكد أنه ملف ZIP سليم من Figma Export.'); }
  const entries = Object.entries(zip);
  if (entries.length > 5000) throw new Error('عدد الملفات داخل ZIP كبير جدًا.');
  const bySuffix = key => entries.find(([name]) => name === key || name.endsWith('/' + key));
  const readJson = name => {
    const entry = bySuffix(name);
    if (!entry) return null;
    try { return JSON.parse(strFromU8(entry[1])); }
    catch { throw new Error(`تعذر قراءة ${name} داخل ZIP.`); }
  };
  const meta = readJson('meta.json');
  if (!meta || !meta.fileKey) throw new Error('ZIP غير مدعوم؛ مطلوب تصدير Figma Export وفيه meta.json.');
  if (fileKey && meta.fileKey !== fileKey) throw new Error('التصدير يخص ملف Figma مختلفًا عن الرابط.');
  const changes = readJson('changes.json') || {};
  const viewEntries = entries.filter(([name]) => /(?:^|\/)views\/[^/]+\.json$/.test(name));
  const delta = isDeltaChanges(changes);
  const viewMap = {};
  if (delta) {
    if (!baseline?.views || baseline.fileKey !== meta.fileKey) throw new Error('تصدير Delta يحتاج تصدير Full سابقًا لنفس الملف. استورد Full ZIP أولًا، ثم أعد استيراد Delta.');
    Object.assign(viewMap, baseline.views);
    const mentioned = [...deltaIds(changes, 'addedViews'), ...deltaIds(changes, 'changedViews')];
    if (!mentioned.length && !viewEntries.length && !deltaIds(changes, 'removedViews').length) throw new Error('صيغة Delta غير مفهومة. صدّر Full Export.');
    for (const id of mentioned) {
      const forms = formsOf(id);
      const inZip = viewEntries.some(([name]) => name.includes(forms.hyphen));
      const inBase = Object.keys(viewMap).some(name => name.includes(forms.hyphen));
      if (!inZip && !inBase) throw new Error(`Delta يذكر ${id} من غير ملف العرض في ZIP أو في النسخة الأساسية.`);
    }
    for (const id of deltaIds(changes, 'removedViews')) {
      const forms = formsOf(id);
      for (const name of Object.keys(viewMap)) if (name.includes(forms.hyphen)) delete viewMap[name];
    }
  }
  for (const [name, data] of viewEntries) viewMap[name] = JSON.parse(strFromU8(data));
  if (!Object.keys(viewMap).length) throw new Error('لم أجد ملفات views/*.json داخل ZIP.');
  const nodeIndex = readJson('node-index.json');
  const requested = nodeId ? formsOf(nodeId).colon : null;
  const hinted = viewHint(nodeIndex, requested);
  const ordered = Object.entries(viewMap).sort((a, b) => {
    if (!hinted) return 0;
    const score = name => (hinted.endsWith(name) || name.endsWith(hinted) ? -1 : 0);
    return score(a[0]) - score(b[0]);
  });
  let selected = null;
  let viewName = null;
  for (const [name, parsed] of ordered) {
    const tree = parsed?.tree || parsed;
    const picked = requested ? findInExportTree(tree, { id: requested }) : nodeName ? findInExportTree(tree, { name: nodeName }) : null;
    if (picked) { selected = picked; viewName = name; break; }
  }
  if (!selected && !requested && !nodeName) {
    const first = ordered[0];
    selected = first[1]?.tree || first[1];
    viewName = first[0];
  }
  if (!selected) throw new Error(`العنصر ${requested || nodeName} غير موجود في التصدير. اختر Copy link to selection ثم أعد التصدير.`);
  const ref = normalizeExportNode(selected, { fileName: meta.fileName });
  const preview = findPreview(entries, selected, viewName);
  return {
    ref, selectedId: selected.id, sourceType: 'figma-export-zip', fileKey: meta.fileKey, viewName, exportedAt: meta.exportedAt,
    deltaApplied: delta, bundleBaseline: { fileKey: meta.fileKey, views: viewMap },
    sideFiles: {
      nodeIndex: sideFile(readJson, 'node-index.json'),
      tokens: sideFile(readJson, 'tokens.json'),
      styles: sideFile(readJson, 'styles.json'),
      components: sideFile(readJson, 'components.json'),
    },
    previewPng: preview ? preview.bytes : null,
    previewKind: preview?.kind || null,
    index: collectIndex(viewMap),
  };
}
