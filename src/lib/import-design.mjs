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

/** Decode an authorized plugin ZIP; no Figma network calls are made. */
export function importFigmaExportZip(raw, { fileKey=null, nodeId=null }={}) {
  if (raw.byteLength > 50_000_000) throw new Error('ملف ZIP كبير جدًا (الحد 50MB).');
  let zip;
  try { zip = unzipSync(raw instanceof Uint8Array ? raw : new Uint8Array(raw)); }
  catch { throw new Error('تعذر فتح ZIP. تأكد أنه ناتج من Figma Export.'); }
  const entries = Object.entries(zip);
  if (entries.length > 5000) throw new Error('عدد الملفات داخل ZIP كبير جدًا.');
  const bySuffix = key => entries.find(([name]) => name === key || name.endsWith('/'+key));
  const readJson = name => { const entry=bySuffix(name); return entry ? JSON.parse(strFromU8(entry[1])) : null; };
  const meta = readJson('meta.json');
  if (!meta || !meta.fileKey) throw new Error('ZIP غير مدعوم؛ مطلوب تصدير Figma Export وفيه meta.json.');
  if (fileKey && meta.fileKey !== fileKey) throw new Error('التصدير يخص ملف Figma مختلفًا عن الرابط.');
  const changes = readJson('changes.json') || {};
  if (changes.mode === 'delta') throw new Error('تصدير Delta يحتاج دمجًا مع النسخة الأصلية؛ استخدم Full Export للـMVP.');
  const viewEntries = entries.filter(([name]) => /(?:^|\/)views\/[^/]+\.json$/.test(name));
  if (!viewEntries.length) throw new Error('لم أجد ملفات views/*.json داخل ZIP.');
  let selected = null;
  let viewName = null;
  const requested = nodeId ? String(nodeId).replace(/-/g,':') : null;
  for (const [name, data] of viewEntries) {
    const parsed = JSON.parse(strFromU8(data));
    const picked = requested ? findInExportTree(parsed.tree,{id:requested}) : parsed.tree;
    if (picked) { selected = picked; viewName = name; break; }
  }
  if (!selected) throw new Error(`العنصر ${requested} غير موجود في التصدير. اختر Copy link to selection ثم أعد التصدير.`);
  const ref = normalizeExportNode(selected,{fileName:meta.fileName});
  return {ref,selectedId:selected.id,sourceType:'figma-export-zip',fileKey:meta.fileKey,viewName,exportedAt:meta.exportedAt};
}
