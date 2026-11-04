import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-zA-Z0-9-]{16,80}$/;
const KEY_RE = /^[a-zA-Z0-9]{8,128}$/;

function contained(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function decodePngBase64(value) {
  if (typeof value !== 'string' || value.length > 6_000_000) throw new Error('صورة PNG غير صالحة أو أكبر من الحد.');
  const cleaned = value.replace(/^data:image\/png;base64,/, '');
  const bytes = Buffer.from(cleaned, 'base64');
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('المرفق ليس صورة PNG.');
  }
  if (bytes.length > 4_000_000) throw new Error('صورة PNG أكبر من 4MB ولم تُحفظ.');
  return bytes;
}

export function savePrivatePng(dataDir, id, bytes) {
  if (!ID_RE.test(id || '')) throw new Error('معرّف الأصل غير صالح.');
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 8 || bytes[0] !== 0x89) throw new Error('المرفق ليس صورة PNG.');
  if (bytes.length > 4_000_000) throw new Error('صورة PNG أكبر من 4MB ولم تُحفظ.');
  const dir = path.join(dataDir, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.png`);
  if (!contained(dir, file)) throw new Error('مسار الأصل خارج المجلد الخاص.');
  fs.writeFileSync(file, bytes);
  return file;
}

export function readPrivatePng(dataDir, id) {
  if (!ID_RE.test(id || '')) return null;
  const dir = path.join(dataDir, 'assets');
  const file = path.join(dir, `${id}.png`);
  if (!contained(dir, file) || !fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

export function baselineFile(dataDir, fileKey) {
  if (!KEY_RE.test(fileKey || '')) throw new Error('مفتاح الملف غير صالح.');
  const dir = path.join(dataDir, 'baselines', fileKey);
  const file = path.join(dir, 'bundle.json');
  if (!contained(path.join(dataDir, 'baselines'), file)) throw new Error('مسار النسخة الأساسية غير صالح.');
  return file;
}

export function readBaseline(dataDir, fileKey) {
  const file = baselineFile(dataDir, fileKey);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeBaseline(dataDir, bundle) {
  if (!bundle?.fileKey || !bundle.views) throw new Error('النسخة الأساسية ناقصة.');
  const file = baselineFile(dataDir, bundle.fileKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ fileKey: bundle.fileKey, savedAt: new Date().toISOString(), views: bundle.views }));
  return file;
}
