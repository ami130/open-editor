/**
 * image-url.js — src/srcset scheme policy for the image plugin.
 *
 * Both helpers delegate to the central sanitizer's isUnsafeUrl so the image
 * plugin's URL policy stays in lockstep with the main sanitizer (blocks
 * javascript:/vbscript:/data:/blob:/filesystem:; data: gated by imageAllowDataUri).
 */
import { isUnsafeUrl } from '../../sanitizer/sanitizer-utils.js';

// Raster image MIME subtypes we accept as a data: URI. Deliberately EXCLUDES
// image/svg+xml — an inline SVG can carry <script>/on* handlers, so a data:
// SVG is a stored-XSS vector even inside an <img>. The central isUnsafeUrl only
// has a single `data:` on/off gate with no subtype check, so we enforce the
// subtype allowlist HERE (image-specific) without loosening the global policy.
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)[;,]/i;

// A data: URI is allowed only when data-URIs are enabled AND it is a raster
// image subtype from the allowlist above.
function isSafeImageDataUri(url, config) {
  if (!/^data:/i.test(url)) return true;           // not a data: URI — n/a here
  if (!config.imageAllowDataUri) return false;     // data: disabled entirely
  return SAFE_DATA_IMAGE_RE.test(url);             // must be an allowed raster type
}

// Return the src if safe, else null (blocked).
export function sanitizeSrc(src, config = {}) {
  if (typeof src !== 'string' || !src.trim()) return null;
  const trimmed = src.trim();
  // IMG12: block a protocol-relative URL (`//host/x.png`). It inherits the page
  // scheme and loads a cross-origin resource — an image src has no legitimate
  // need for it, and it's a tracking-pixel / mixed-content vector the scheme-
  // based isUnsafeUrl check misses. (Links intentionally allow `//host`; images
  // don't.) A root-relative `/x.png` (single slash) is still allowed.
  if (/^\/\//.test(trimmed)) return null;
  if (isUnsafeUrl(trimmed, { allowDataUris: !!config.imageAllowDataUri })) return null;
  // Subtype gate for data: URIs (blocks data:image/svg+xml and mislabeled data:).
  if (!isSafeImageDataUri(trimmed, config)) return null;
  return trimmed;
}

// Every srcset candidate URL must pass the same scheme policy as src; drop the
// whole srcset if any is unsafe. Mirrors the main sanitizer's M1 srcset handling.
export function sanitizeSrcset(srcset, config = {}) {
  if (typeof srcset !== 'string' || !srcset.trim()) return null;
  const opts = { allowDataUris: !!config.imageAllowDataUri };
  const unsafe = srcset.split(',').some((cand) => {
    const url = cand.trim().split(/\s+/)[0];
    return url && (isUnsafeUrl(url, opts) || !isSafeImageDataUri(url, config));
  });
  return unsafe ? null : srcset;
}
