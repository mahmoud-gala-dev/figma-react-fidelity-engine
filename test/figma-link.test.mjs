import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFigmaLink} from '../src/lib/figma-link.mjs';

test('parses user Figma design link with node-id',()=>{
  const p=parseFigmaLink('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1&p=f');
  assert.equal(p.fileKey,'vMYpz8Jc3EzVUsLQCDx3Jd');
  assert.equal(p.nodeId,'0:1');
});
test('allows figma link without node id',()=>{
  const p=parseFigmaLink('https://www.figma.com/file/abcdefghijklmnop/Test');
  assert.equal(p.nodeId,null);
});
test('rejects external URL',()=>assert.throws(()=>parseFigmaLink('https://evil.example/design/abcdefghijklmnop'),/figma.com/));
test('allows http figma links in development mode (default)',()=>{
  const p=parseFigmaLink('http://www.figma.com/design/abcdefghijklmnop/Test?node-id=0-1');
  assert.equal(p.fileKey,'abcdefghijklmnop');
  assert.equal(p.nodeId,'0:1');
  assert.equal(p.isHttpDev,true);
  assert.equal(p.url,'https://www.figma.com/design/abcdefghijklmnop/Test?node-id=0-1');
});
test('allows local http dev URL in development mode',()=>{
  const p=parseFigmaLink('http://127.0.0.1:5173/');
  assert.equal(p.isLocalDevUrl,true);
  assert.equal(p.isHttpDev,true);
  assert.equal(p.localFigPath,'fixtures/sample-design.fig');
});
test('rejects http links when allowHttp is false (production mode)',()=>assert.throws(()=>parseFigmaLink('http://www.figma.com/design/abcdefghijklmnop',{allowHttp:false}),/HTTPS/));
