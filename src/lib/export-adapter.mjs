import {normalizeHexColor} from './compare.mjs';
/** Adapter for Baolv/figma-export's documented NodeRecord/ViewRecord schema. */
export function normalizeExportNode(node, meta = {}) {
  if (!node || typeof node !== 'object') throw new TypeError('Export node must be object');
  const box=node.box || {};
  const fills=Array.isArray(node.fills)?node.fills:[];
  const bg=fills.find(fill=>typeof fill?.hex === 'string')?.hex || node.color?.hex || null;
  let radius=null;
  if(typeof node.cornerRadius==='number') radius=node.cornerRadius;
  else if(node.cornerRadius && typeof node.cornerRadius==='object') {
    const values=Object.values(node.cornerRadius).filter(x=>typeof x==='number');
    if(values.length===4 && values.every(x=>x===values[0]))radius=values[0];
  }
  return {
    source:'figma-export-plugin', sourceName:meta.fileName||'Figma Export ZIP',
    sourceEditor:'figma-design', nodeId:node.id||null,
    nodeName:node.name||'Unnamed', nodeType:node.type||'UNKNOWN',
    width:typeof box.w==='number'?box.w:null,
    height:typeof box.h==='number'?box.h:null,
    backgroundColor: normalizeHexColor(bg),
    borderRadius:radius,
    text:typeof node.text==='string'?node.text:null,
    fontSize:typeof node.font?.size==='number'?node.font.size:null,
    fontFamily:node.font?.family||null,
    absolutePosition:typeof box.x==='number'&&typeof box.y==='number'?{x:box.x,y:box.y}:null,
    previewSource: meta.previewSource||null,
    note:'حقل previewSource يدل على صورة عنصر/شاشة إذا كانت متاحة في التصدير؛ يجب مطابقة نطاق الصورة قبل Pixel Diff.'
  };
}
export function findInExportTree(tree, {id=null,name=null}={}) {
  if(!tree)return null;
  const targetId=id?String(id).replace(/-/g,':'):null;
  const stack=[tree];
  while(stack.length){const n=stack.pop();if((targetId&&n.id===targetId)||(!targetId&&name&&n.name===name))return n;
    if(Array.isArray(n.children))stack.push(...[...n.children].reverse());}
  return null;
}
