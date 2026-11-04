/**
 * Parse Figma URLs locally. This does NOT fetch the Figma design.
 * Supports HTTPS and (in development mode) HTTP URLs from figma.com as well as local dev HTTP URLs.
 */
export function parseFigmaLink(value, options = {}) {
  if (!value || !String(value).trim()) throw new Error('أدخل رابط Figma أولًا.');
  const raw = String(value).trim();

  const isDevMode =
    options.devMode ??
    (typeof process !== 'undefined' && process.env?.NODE_ENV
      ? process.env.NODE_ENV !== 'production'
      : true);
  const allowHttp = options.allowHttp ?? isDevMode;

  let candidate = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    if (/^(www\.)?figma\.com\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (allowHttp && /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(candidate)) {
      candidate = `http://${candidate}`;
    }
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('الرابط غير صالح. انسخ رابط التصميم من Figma.');
  }

  const hostname = url.hostname.toLowerCase();
  const isFigmaHost = ['figma.com', 'www.figma.com'].includes(hostname);
  const isLocalDevHost = allowHttp && ['localhost', '127.0.0.1'].includes(hostname);

  if (!isFigmaHost && !isLocalDevHost) {
    throw new Error('الرابط غير مسموح. يُسمح فقط بروابط figma.com (عبر HTTPS أو HTTP في وضع التطوير).');
  }

  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error('يجب أن يكون الرابط HTTPS من figma.com فقط.');
  }

  const rawId = url.searchParams.get('node-id');
  let nodeId = null;
  let rawNodeId = null;
  if (rawId) {
    const decoded = decodeURIComponent(rawId).trim().replace(/-/g, ':');
    const segments = decoded.split(';').map(s => s.trim()).filter(Boolean);
    if (!segments.length || !segments.every(seg => /^I?\d+:\d+$/i.test(seg))) {
      throw new Error('معرّف العنصر node-id غير صالح.');
    }
    rawNodeId = segments.join(';');
    const leafSegment = segments[segments.length - 1].replace(/^I/i, '');
    nodeId = leafSegment;
  }

  const parts = url.pathname.split('/').filter(Boolean);

  if (isLocalDevHost) {
    const hasDesignPath =
      ['design', 'file', 'board'].includes(parts[0]) && /^[a-zA-Z0-9_-]{6,}$/.test(parts[1] || '');
    const kind = hasDesignPath ? parts[0] : 'design';
    return {
      fileKey: hasDesignPath ? parts[1] : 'local-dev-http',
      fileName: hasDesignPath && parts[2] ? decodeURIComponent(parts[2]) : 'Local Dev HTTP Design',
      nodeId: nodeId || '942:2734',
      rawNodeId: rawNodeId || nodeId || '942:2734',
      url: url.href,
      originalUrl: raw,
      protocol: url.protocol,
      isHttpDev: url.protocol === 'http:',
      isLocalDevUrl: true,
      localFigPath: 'fixtures/sample-design.fig',
      kind,
      surface: kind === 'board' ? 'figjam' : 'design',
    };
  }

  let kind = parts[0];
  let fileKey = parts[1] || '';
  let branchKey = null;
  let fileName = '';

  if (parts[0] === 'community' && parts[1] === 'file' && /^[a-zA-Z0-9_-]{8,}$/.test(parts[2] || '')) {
    kind = 'file';
    fileKey = parts[2];
    fileName = parts[3] ? decodeURIComponent(parts[3]) : '';
  } else if (['design', 'file', 'board', 'proto'].includes(parts[0]) && /^[a-zA-Z0-9_-]{8,}$/.test(parts[1] || '')) {
    if (parts[2] === 'branch' && /^[a-zA-Z0-9_-]{6,}$/.test(parts[3] || '')) {
      branchKey = parts[3];
      fileName = parts[4] ? decodeURIComponent(parts[4]) : '';
    } else {
      fileName = parts[2] ? decodeURIComponent(parts[2]) : '';
    }
  } else {
    throw new Error('صيغة الرابط غير مدعومة. افتح تصميم Figma ثم انسخ رابطه.');
  }

  const canonicalUrlObj = new URL(url.href);
  canonicalUrlObj.protocol = 'https:';

  return {
    fileKey,
    branchKey,
    fileName,
    nodeId,
    rawNodeId,
    url: canonicalUrlObj.href,
    originalUrl: raw,
    protocol: url.protocol,
    isHttpDev: url.protocol === 'http:',
    isLocalDevUrl: false,
    kind,
    surface: kind === 'board' ? 'figjam' : 'design',
  };
}

