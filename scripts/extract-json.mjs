import fs from 'node:fs';
import path from 'node:path';
import { normalizeJsonNode } from '../src/lib/compare.mjs';

const args = process.argv.slice(2);
const input = args.find(x => !x.startsWith('--') && args[args.indexOf(x)-1] !== '--name' && args[args.indexOf(x)-1] !== '--id');
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; };
if (!input || !fs.existsSync(input)) {
  console.error('Usage: npm run extract:json -- path/to/file.json --name "Buy ice cream" [--id "942:2734"]');
  process.exit(1);
}
const root = JSON.parse(fs.readFileSync(input, 'utf8'));
const requestedId = flag('--id'); const requestedName = flag('--name') || 'Buy ice cream';
const matches = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (requestedId ? node.id === requestedId : node.name === requestedName) matches.push(node);
  for (const child of node.children || []) walk(child);
}
walk(root.document || root);
if (!matches.length) {
  console.error(`لم يُعثر على ${requestedId || requestedName} — جرّب اسم عنصر آخر أو معرفه.`);
  process.exit(2);
}
if (matches.length > 1) console.warn(`تنبيه: يوجد ${matches.length} عناصر مطابقة؛ اخترنا الأول. استخدم --id لتحديد عنصر بعينه.`);
const out = normalizeJsonNode(matches[0], root);
const target = path.resolve('public/reference.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Saved ${target} | ${out.nodeName} (${out.nodeId}) | ${out.width} x ${out.height}`);
