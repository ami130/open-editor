/**
 * image-url.js — src/srcset scheme policy for the image plugin.
 *
 * Both helpers delegate to the central sanitizer's isUnsafeUrl so the image
 * plugin's URL policy stays in lockstep with the main sanitizer (blocks
 * javascript:/vbscript:/data:/blob:/filesystem:; data: gated by imageAllowDataUri).
 */
import { isUnsafeUrl } from '../../sanitizer/sanitizer-utils.js';

// Return the src if safe, else null (blocked).
export function sanitizeSrc(src, config = {}) {
  if (typeof src !== 'string' || !src.trim()) return null;
  const trimmed = src.trim();
  if (isUnsafeUrl(trimmed, { allowDataUris: !!config.imageAllowDataUri })) return null;
  return trimmed;
}

// Every srcset candidate URL must pass the same scheme policy as src; drop the
// whole srcset if any is unsafe. Mirrors the main sanitizer's M1 srcset handling.
export function sanitizeSrcset(srcset, config = {}) {
  if (typeof srcset !== 'string' || !srcset.trim()) return null;
  const opts = { allowDataUris: !!config.imageAllowDataUri };
  const unsafe = srcset.split(',').some((cand) => {
    const url = cand.trim().split(/\s+/)[0];
    return url && isUnsafeUrl(url, opts);
  });
  return unsafe ? null : srcset;
}
