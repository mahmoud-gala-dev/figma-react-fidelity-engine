import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

test('reg-cli writes an HTML report from real images', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  const actual = path.join(dir, 'actual');
  const expected = path.join(dir, 'expected');
  const diff = path.join(dir, 'diff');
  fs.mkdirSync(actual);
  fs.mkdirSync(expected);
  const left = new PNG({ width: 2, height: 1 });
  const right = new PNG({ width: 2, height: 1 });
  left.data.fill(255);
  right.data.fill(255);
  right.data[0] = 0;
  fs.writeFileSync(path.join(actual, 'item.png'), PNG.sync.write(left));
  fs.writeFileSync(path.join(expected, 'item.png'), PNG.sync.write(right));
  const report = path.join(dir, 'report.html');
  const cli = path.resolve('node_modules/reg-cli/dist/cli.js');
  execFileSync(process.execPath, [cli, actual, expected, diff, '-R', report, '-J', path.join(dir, 'reg.json'), '-I', '-M', '0.1'], { timeout: 60000 });
  const html = fs.readFileSync(report, 'utf8');
  assert.match(html, /<html/i);
  assert.equal(fs.existsSync(path.join(dir, 'reg.json')), true);
});
