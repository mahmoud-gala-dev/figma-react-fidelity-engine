/** Best-effort adapter for native Figma .fig files; MUST be validated on a real file. */
import fs from 'node:fs';
import path from 'node:path';
import { parseFig, nodeId } from 'openfig-core';
import { figmaColorToHex } from '../src/lib/compare.mjs';

const args = process.argv.slice(2);
const file = args[0];
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; };
if (!file || !fs.existsSync(file)) {
 console.error('Usage: npm run extract:fig -- path/to/design.fig --name "Target layer"');
 process.exit(1);
}
let doc;
try { doc = parseFig(new Uint8Array(fs.readFileSync(file))); }
catch (err) { console.error('OpenFig could not parse this file:', err.message); process.exit(2); }
console.log(`OpenFig parsed ${doc.nodes.length} nodes. First 20 layers:`);
for (const n of doc.nodes.slice(0, 20)) console.log(`${nodeId(n)} | ${n.type} | ${n.name}`);
const name = flag('--name'); const id = flag('--id');
if (!name && !id) { console.log('حدد --name أو --id لتحويل عنصر. لم يتم إنشاء reference.json.'); process.exit(0); }
const candidates = doc.nodes.filter(n => id ? nodeId(n) === id : n.name === name);
if (!candidates.length) { console.error('العنصر غير موجود في الملف. راجع أسماء الطبقات أعلاه.'); process.exit(3); }
if (candidates.length > 1) console.warn(`${candidates.length} nodes matched; using first. Pass --id for exact selection.`);
const n = candidates[0];
const solid = (n.fillPaints || []).find(x => (x?.type === 'SOLID' || x?.type === 'solid') && x.color);
const ref = {
 source:'openfig-native-file', sourceName: path.basename(file), sourceEditor:'.fig',
 nodeId: nodeId(n), nodeName:n.name, nodeType:n.type,
 width: typeof n.size?.x === 'number' ? n.size.x : null,
 height: typeof n.size?.y === 'number' ? n.size.y : null,
 backgroundColor:figmaColorToHex(solid?.color),
 borderRadius: typeof n.cornerRadius === 'number' ? n.cornerRadius : null,
 text: typeof n.textData?.characters === 'string' ? n.textData.characters : null,
 fontSize:null, fontFamily:null, absolutePosition:null,
 note:'محول .fig تجريبي؛ راجع الحقول الناقصة والاختلافات في تنسيق التخزين قبل اعتماد النتائج.'
};
fs.writeFileSync(path.resolve('public/reference.json'), JSON.stringify(ref,null,2)+'\n');
console.log('Saved public/reference.json\n'+JSON.stringify(ref,null,2));
if (['width','height','backgroundColor'].some(k => ref[k] == null)) console.warn('WARNING: Some fields were not decoded. Do not count them in score until mapped correctly.');
