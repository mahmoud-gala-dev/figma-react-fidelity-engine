import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findInExportTree,normalizeExportNode} from '../src/lib/export-adapter.mjs';
const sample={id:'1:1',name:'Board',type:'FRAME',box:{x:4,y:5,w:100,h:200},children:[{id:'2:9',name:'Buy ice cream',type:'SHAPE_WITH_TEXT',box:{x:7,y:8,w:112,h:99.555557},fills:[{hex:'#ff9a62'}],cornerRadius:6,text:'Buy ice cream'}]};
test('find nested node by Figma id',()=>assert.equal(findInExportTree(sample,{id:'2-9'}).id,'2:9'));
test('find nested node by name',()=>assert.equal(findInExportTree(sample,{name:'Buy ice cream'}).id,'2:9'));
test('plugin node normalizes into reference schema',()=>{const out=normalizeExportNode(sample.children[0],{fileName:'Client File'});assert.equal(out.width,112);assert.equal(out.backgroundColor,'#FF9A62');assert.equal(out.borderRadius,6);assert.equal(out.source,'figma-export-plugin');});
test('incomplete exporter properties remain null',()=>{const out=normalizeExportNode({name:'Frame'},{});assert.equal(out.backgroundColor,null);assert.equal(out.width,null);});
