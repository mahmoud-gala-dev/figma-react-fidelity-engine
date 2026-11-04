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
test('parses instance sub-node IDs (1234-5678;9012-3456 and I1234:5678;9012:3456)',()=>{
  const p1=parseFigmaLink('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/Team-Library?node-id=1234-5678;9012-3456');
  assert.equal(p1.nodeId,'9012:3456');
  assert.equal(p1.rawNodeId,'1234:5678;9012:3456');
  const p2=parseFigmaLink('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/Team-Library?node-id=I1234-5678%3B9012-3456');
  assert.equal(p2.nodeId,'9012:3456');
});
test('parses Figma branch URLs and community file URLs',()=>{
  const branch=parseFigmaLink('https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/branch/BrAnChKeY999/My-Branch-Design?node-id=12-34');
  assert.equal(branch.fileKey,'vMYpz8Jc3EzVUsLQCDx3Jd');
  assert.equal(branch.branchKey,'BrAnChKeY999');
  assert.equal(branch.fileName,'My-Branch-Design');
  assert.equal(branch.nodeId,'12:34');

  const comm=parseFigmaLink('https://www.figma.com/community/file/1234567890123456789/UI-Kit-System?node-id=1-2');
  assert.equal(comm.fileKey,'1234567890123456789');
  assert.equal(comm.fileName,'UI-Kit-System');
  assert.equal(comm.nodeId,'1:2');
});

