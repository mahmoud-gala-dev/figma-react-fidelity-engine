/** Ingest ZIP manually exported by Baolv/figma-export; NEVER calls Figma API. */
import fs from 'node:fs';
import path from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {findInExportTree,normalizeExportNode} from '../src/lib/export-adapter.mjs';
const args=process.argv.slice(2);const file=args[0];
const flag=f=>{const i=args.indexOf(f);return i<0?null:args[i+1];};
if(!file||!fs.existsSync(file)){console.error('Usage: npm run export:zip -- input/export.zip --id "123:456" OR --name "Buy ice cream"');process.exit(1);}
const raw=fs.readFileSync(file);if(raw.length>100*1024*1024){console.error('ZIP exceeds 100 MB input limit');process.exit(2);}
let zip;try{zip=unzipSync(new Uint8Array(raw));}catch(e){console.error('Invalid ZIP: '+e.message);process.exit(3);}
const files=Object.entries(zip);if(files.length>5000){console.error('Too many files');process.exit(4);}
const entry=(p)=>files.find(([k])=>k===p||k.endsWith('/'+p));
const json=(p)=>{const f=entry(p);return f?JSON.parse(strFromU8(f[1])):null;};
const meta=json('meta.json')||{};
const changes=json('changes.json')||{};
if(changes.mode==='delta'){console.error('Delta ZIP alone is unsupported in this MVP. Export a FULL ZIP for a verified baseline.');process.exit(6);}
const viewFiles=files.filter(([k])=>/^(?:[^/]+\/)*views\/[\w-]+\.json$/.test(k));
const id=flag('--id'),name=flag('--name');
if(!id&&!name){console.log('Found views:',viewFiles.map(([k])=>k));console.log('Supply --id or --name to select a node');process.exit(0);}
let selected=null,viewKey=null;
for(const [k,bytes] of viewFiles){const view=JSON.parse(strFromU8(bytes));const found=findInExportTree(view.tree,{id,name});if(found){selected=found;viewKey=k;break;}}
if(!selected){console.error(`Cannot find node ${id||name}. Full export may be required.`);process.exit(5);}
const viewId=path.basename(viewKey,'.json');
const ref=normalizeExportNode(selected,meta);
const out=path.resolve('public/reference.json');fs.writeFileSync(out,JSON.stringify(ref,null,2)+'\n');
// A Figma export may include a screenshot of a WHOLE VIEW; do not silently
// compare that image with a single React component (different scope/size).
const exactComponent=files.find(([k])=>k.endsWith(`components/${String(selected.id).replace(/:/g,'-')}.png`));
if(exactComponent){const target=path.resolve('input/figma-expected.png');fs.mkdirSync('input',{recursive:true});fs.writeFileSync(target,exactComponent[1]);console.log('Exported component image: '+target+' (verify dimensions against React before pixel comparison)');}
else console.log(`View screenshot is in ZIP: views/${viewId}.png (not used automatically for element comparison)`);
console.log(`Saved ${out}. Source ${meta.fileName||'unknown'}, selected ${selected.id}, fields ${Object.keys(ref).length}.`);
console.log('Only property metrics are automatic. For visual comparison ensure a true same-scope Figma image exists at input/figma-expected.png.');
