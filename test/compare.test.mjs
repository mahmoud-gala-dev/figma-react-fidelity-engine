import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareSpecs,figmaColorToHex,normalizeJsonNode,normalizeHexColor} from '../src/lib/compare.mjs';
const ref=JSON.parse(fs.readFileSync('public/reference.json','utf8'));
test('Original FigJam sample colors',()=> assert.equal(figmaColorToHex({r:1,g:0.6039215922355652,b:0.3843137323856354}), '#FF9A62'));
test('CSS rgb color normalized',()=>assert.equal(normalizeHexColor('rgb(255, 154, 98)'),'#FF9A62'));
test('Exact reference = 100 percent',()=> { const r=compareSpecs(ref,ref); assert.equal(r.score,100);assert.equal(r.passed,5); });
test('Width mismatch = 75 percent',()=> { const r=compareSpecs(ref,{...ref,width:140});assert.equal(r.score,75);assert.equal(r.passed,4); });
test('No missing/undefined property counted as matched',()=> { const r=compareSpecs(ref,{width:ref.width}); assert.equal(r.passed,1); assert.equal(r.score,25);});
test('Extract shape with text from source schema',()=>{
 const source=JSON.parse(fs.readFileSync('fixtures/sample-original-node.json','utf8'));
 const n=normalizeJsonNode(source.document.children[0],source);
 assert.equal(n.nodeId,'942:2734');assert.equal(n.width,112);assert.equal(n.borderRadius,6);
 assert.equal(n.text,'Buy ice cream');assert.equal(n.backgroundColor,'#FF9A62');
});
