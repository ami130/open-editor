/**
 * image-fetch.js — resolves remote (http/https) <img> URLs to real bytes so
 * they can be embedded in the .docx, instead of always falling back to a text
 * placeholder. This is the ONE place in the export path that touches the
 * network; ooxml-body.js's tree-walk stays pure/synchronous and just consults
 * the resolved map this module builds.
 *
 * Design: a pre-pass, not an inline await-per-image. bodyXml()'s recursive walk
 * would otherwise need every function converted to async (invasive, and
 * serializes what should be parallel network requests). Instead: scan the HTML
 * for every unique image src BEFORE walking, fetch them all concurrently, and
 * hand the walk a synchronous lookup (Map) of the results.
 *
 * Every failure mode (CORS, 404, timeout, non-image response, network error)
 * resolves to `null` for that URL rather than rejecting — a failed fetch must
 * never abort the whole export; the caller falls back to the existing
 * `[Image: alt]` placeholder for just that image.
 */

const FETCH_TIMEOUT_MS = 10000;

const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/gif': 'gif', 'image/bmp': 'bmp', 'image/webp': 'webp',
};

/** All distinct http(s) <img src> values in the given root, in document order. */
export function collectRemoteImageSrcs(root) {
  const seen = new Set();
  const out = [];
  for (const img of root.querySelectorAll('img[src]')) {
    const src = (img.getAttribute('src') || '').trim();
    if (!src || seen.has(src)) continue;
    if (/^https?:\/\//i.test(src)) { seen.add(src); out.push(src); }
  }
  return out;
}

/** Sniff the image extension from the first bytes (magic numbers) when the
 * Content-Type header is missing/generic — some hosts serve images as
 * application/octet-stream. Returns null if unrecognized. */
function sniffExt(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return { mime: 'image/png', ext: 'png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { mime: 'image/gif', ext: 'gif' };
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return { mime: 'image/bmp', ext: 'bmp' };
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Fetch one image URL → { mime, ext, bytes } or null on ANY failure. */
async function fetchOne(src, fetchImpl) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(src, controller ? { signal: controller.signal } : undefined);
    if (!res || !res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (!bytes.length) return null;
    const ct = (res.headers && res.headers.get && res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = MIME_EXT[ct];
    if (ext) return { mime: ct, ext, bytes };
    // Header missing/generic (octet-stream, etc.) — sniff the actual bytes.
    const sniffed = sniffExt(bytes);
    return sniffed ? { ...sniffed, bytes } : null;
  } catch {
    return null; // network error, CORS rejection, timeout/abort — all fail soft
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch every remote image in `root` concurrently.
 * @param {Element} root parsed document root (bodyXml's tmp container)
 * @param {typeof fetch} [fetchImpl] injectable for tests; defaults to global fetch
 * @returns {Promise<Map<string, {mime,ext,bytes}|null>>} src → result (or null)
 */
export async function resolveRemoteImages(root, fetchImpl) {
  const impl = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const srcs = collectRemoteImageSrcs(root);
  const map = new Map();
  if (!impl || !srcs.length) return map;
  const results = await Promise.all(srcs.map((src) => fetchOne(src, impl)));
  srcs.forEach((src, i) => map.set(src, results[i]));
  return map;
}
