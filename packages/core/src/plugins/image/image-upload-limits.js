/**
 * image-upload-limits.js — size guards and server-error formatting for uploads.
 *
 * Split out of image-upload.js purely to respect the 300-line source limit; it
 * is a cohesive group (what is too big, and how to explain a failure) with no
 * dependency on the upload mechanism itself. Re-exported from image-upload.js
 * so no existing import path changes.
 */

// ─── Shared file-size guard (single source of truth, config-driven) ──────────

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** The effective max upload size in bytes (config.imageMaxFileSize or 10 MB). */
export function maxFileSize(config = {}) {
  const v = config.imageMaxFileSize;
  return (typeof v === 'number' && v > 0) ? v : DEFAULT_MAX_FILE_SIZE;
}

/** Human "12.3 MB" for messages. */
export function formatMB(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

/**
 * Extract a short human error from a failed XHR: a JSON {error|message} field or
 * a plain-text body, trimmed to a sane length; falls back to the status code.
 * HTML error pages (e.g. a 413 page) are ignored in favour of "HTTP <status>".
 */
export function serverErrorDetail(xhr) {
  const status = xhr.status || 0;
  const body = (xhr.responseText || '').trim();
  if (!body || /^\s*</.test(body)) return `HTTP ${status}`;   // empty or HTML page
  try {
    const j = JSON.parse(body);
    const msg = j && (j.error || j.message);
    if (typeof msg === 'string' && msg.trim()) return `${msg.trim()} (HTTP ${status})`;
  } catch { /* not JSON — fall through to plain text */ }
  const text = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  return `${text} (HTTP ${status})`;
}

/** Returns an error string if the file is empty or exceeds the limit, else null. */
export function fileSizeError(file, config = {}) {
  const max = maxFileSize(config);
  // A 0-byte file is not a usable image — it would upload/embed to nothing and
  // then fire a broken-image load error. Reject it up front with a clear message.
  if (file && file.size === 0) {
    return 'This file is empty (0 bytes) and can’t be used as an image.';
  }
  if (file && file.size > max) {
    return `File is too large (${formatMB(file.size)}). Maximum is ${formatMB(max)}.`;
  }
  return null;
}

// IMG11: a data-URI embed bloats EVERY save by ~1.33× the file size (inline
// base64), unlike an uploaded URL. Cap the inline path separately and tighter
// than the raw-file limit so a large image can't silently balloon the document.
const DEFAULT_MAX_DATA_URI_SIZE = 1024 * 1024; // 1 MB of source → ~1.33 MB inline
export function maxDataUriSize(config = {}) {
  const v = config.imageMaxDataUriSize;
  return (typeof v === 'number' && v > 0) ? v : DEFAULT_MAX_DATA_URI_SIZE;
}
/** Error string if the file is too big to embed as a data URI (else null). */
export function dataUriSizeError(file, config = {}) {
  const max = maxDataUriSize(config);
  if (file && file.size > max) {
    return `This image (${formatMB(file.size)}) is too large to embed inline. ` +
      `Configure an upload server (imageUploadUrl, or imageUploadHandler for `
      + `S3/Cloudinary-style flows) for images over ${formatMB(max)}, ` +
      'or use a smaller file.';
  }
  return null;
}

