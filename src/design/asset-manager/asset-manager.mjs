import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import {
  decodePngBase64,
  savePrivatePng,
  readPrivatePng,
  readBaseline,
  writeBaseline,
} from '../../integrations/figma/figma-asset-manager.mjs';

export {
  decodePngBase64,
  savePrivatePng,
  readPrivatePng,
  readBaseline,
  writeBaseline,
};

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]{3,128}$/;

function contained(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function saveDesignSnapshot(snapshotsDir, fileKeyOrSnapshot, maybeSnapshot = null) {
  const snapshotObj =
    maybeSnapshot && typeof maybeSnapshot === 'object'
      ? maybeSnapshot
      : fileKeyOrSnapshot && typeof fileKeyOrSnapshot === 'object'
        ? fileKeyOrSnapshot
        : {};
  const rawKey =
    typeof fileKeyOrSnapshot === 'string'
      ? fileKeyOrSnapshot
      : snapshotObj.fileKey || 'local-snapshot';
  const safeKey = SAFE_KEY_RE.test(rawKey) ? rawKey : 'local-snapshot';
  const snapshotId = `${safeKey}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

  fs.mkdirSync(snapshotsDir, { recursive: true });
  const target = path.join(snapshotsDir, `${safeKey}.json`);
  if (!contained(snapshotsDir, target)) {
    throw new Error('مسار حفظ لقطة التصميم خارج المجلد المسموح.');
  }
  const savedAt = snapshotObj.savedAt || new Date().toISOString();
  const payload = {
    ...snapshotObj,
    snapshotId,
    fileKey: safeKey,
    savedAt,
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  const latestPath = path.join(snapshotsDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), 'utf8');
  return { snapshotId, path: target, savedAt };
}

export function readDesignSnapshot(snapshotsDir, fileKey = 'latest') {
  const safeKey = SAFE_KEY_RE.test(fileKey || '') ? fileKey : 'latest';
  const target = path.join(snapshotsDir, `${safeKey}.json`);
  if (!contained(snapshotsDir, target) || !fs.existsSync(target)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

const GENUINE_SOURCES = new Set([
  'figma-reader-screenshot',
  'figma-plugin-export',
  'figma-export-zip',
  'genuine-figma-image-user-supplied',
  'user-supplied-png',
]);

const SYNTHETIC_SOURCES = new Set([
  'synthetic-reference-rendered-from-json',
  'demo',
  'synthetic',
]);

export function validateVisualBaseline(sourceOrFilePath, options = {}) {
  if (!sourceOrFilePath) {
    return {
      valid: false,
      isGenuine: false,
      authentic: false,
      isSynthetic: false,
      source: 'missing',
      reason: 'لا توجد صورة مرجعية.',
    };
  }

  // Case 1: Caller passed a source classification string directly
  const str = String(sourceOrFilePath);
  if (GENUINE_SOURCES.has(str) || SYNTHETIC_SOURCES.has(str) || str === 'missing') {
    const isSynthetic = SYNTHETIC_SOURCES.has(str);
    const isGenuine = GENUINE_SOURCES.has(str) && !isSynthetic;
    return {
      valid: str !== 'missing',
      isGenuine,
      authentic: isGenuine,
      isSynthetic,
      source: str,
      reason: isGenuine
        ? `المرجع البصري مصنف كصورة أصلية (${str}).`
        : isSynthetic
          ? 'المرجع البصري تركيبي/تجريبي من JSON ولا يُحسب كدرجة تشابه بصري أصيل.'
          : 'لا تتوفر صورة مرجعية أصلية.',
    };
  }

  // Case 2: Caller passed a file path on disk
  const source = options.source || 'genuine-figma-image-user-supplied';
  if (!fs.existsSync(str)) {
    return {
      valid: false,
      isGenuine: false,
      authentic: false,
      isSynthetic: false,
      source: 'missing',
      reason: 'ملف الصورة المرجعية غير موجود على القرص.',
    };
  }
  const bytes = fs.readFileSync(str);
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return {
      valid: false,
      isGenuine: false,
      authentic: false,
      isSynthetic: false,
      source,
      reason: 'الملف المرجعي ليس صورة PNG صالحة.',
    };
  }
  try {
    const png = PNG.sync.read(bytes);
    const isSynthetic = SYNTHETIC_SOURCES.has(source);
    const isGenuine = GENUINE_SOURCES.has(source) && !isSynthetic;
    return {
      valid: png.width > 0 && png.height > 0,
      isGenuine,
      authentic: isGenuine,
      isSynthetic,
      source,
      width: png.width,
      height: png.height,
      byteLength: bytes.length,
      reason: isGenuine
        ? `صورة PNG مرجعية صالحة (${png.width}×${png.height}).`
        : 'صورة PNG تركيبية للتجربة فقط.',
    };
  } catch (error) {
    return {
      valid: false,
      isGenuine: false,
      authentic: false,
      isSynthetic: false,
      source,
      reason: `تعذر قراءة أبعاد PNG: ${error.message}`,
    };
  }
}

