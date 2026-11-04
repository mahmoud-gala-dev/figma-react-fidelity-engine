/** Parse Figma URLs locally. This does NOT fetch the Figma design. */
export function parseFigmaLink(value) {
  if (!value || !String(value).trim()) throw new Error('أدخل رابط Figma أولًا.');
  let url;
  try { url = new URL(String(value).trim()); }
  catch { throw new Error('الرابط غير صالح. انسخ رابط التصميم من Figma.'); }
  if (url.protocol !== 'https:' || !['figma.com','www.figma.com'].includes(url.hostname.toLowerCase()))
    throw new Error('يجب أن يكون الرابط HTTPS من figma.com فقط.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['design','file','board'].includes(parts[0]) || !/^[a-zA-Z0-9]{8,}$/.test(parts[1] || ''))
    throw new Error('صيغة الرابط غير مدعومة. افتح تصميم Figma ثم انسخ رابطه.');
  const rawId = url.searchParams.get('node-id');
  let nodeId = null;
  if (rawId) {
    const decoded = rawId.replace(/-/g, ':');
    if (!/^\d+:\d+$/.test(decoded)) throw new Error('معرّف العنصر node-id غير صالح.');
    nodeId = decoded;
  }
  return { fileKey: parts[1], fileName: parts[2] ? decodeURIComponent(parts[2]) : '', nodeId, url: url.href, kind: parts[0] };
}
