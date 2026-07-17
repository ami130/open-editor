/**
 * image-upload.js — File → src resolution for the image plugin (9.3, 9.4, 9.17).
 *
 * Two paths:
 *   readFileAsBase64(file)              → local preview via FileReader (data URI)
 *   uploadFile(file, url, onProgress, signal) → hosted URL via fetch + FormData
 *
 * Both return Promise<{ src, width, height }> or null on abort/failure.
 * Errors emit through the editor error channel; they never propagate to callers.
 */

import { isUnsafeUrl } from '../../sanitizer/sanitizer-utils.js';

// ─── Shared file-size guard (single source of truth, config-driven) ──────────

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** The effective max upload size in bytes (config.imageMaxFileSize or 10 MB). */
export function maxFileSize(config = {}) {
  const v = config.imageMaxFileSize;
  return (typeof v === 'number' && v > 0) ? v : DEFAULT_MAX_FILE_SIZE;
}

/** Human "12.3 MB" for messages. */
export function formatMB(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

/** Returns an error string if the file exceeds the limit, else null. */
export function fileSizeError(file, config = {}) {
  const max = maxFileSize(config);
  if (file && file.size > max) {
    return `File is too large (${formatMB(file.size)}). Maximum is ${formatMB(max)}.`;
  }
  return null;
}

// ─── Measure image dimensions from a data URL ────────────────────────────────

// Measure via a detached <img>. A pathological src can fire NEITHER load nor
// error (stalled decode, exotic data URI), which would leave this promise —
// and every awaiter (readFileAsBase64 / uploadFile) — pending forever. Guard
// with a timeout that resolves to unknown dims {0,0}; the image is still
// inserted and the browser lays it out at its natural size once decoded.
const MEASURE_TIMEOUT_MS = 10000;
function measureImage(src, doc) {
  return new Promise((resolve) => {
    const img = doc.createElement('img');
    let done = false;
    const win = (doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    const settle = (dims) => {
      if (done) return;
      done = true;
      if (timer && win) win.clearTimeout(timer);
      resolve(dims);
    };
    const timer = win ? win.setTimeout(() => settle({ width: 0, height: 0 }), MEASURE_TIMEOUT_MS) : null;
    img.onload  = () => settle({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => settle({ width: 0, height: 0 });
    img.src = src;
  });
}

// ─── 9.3 — FileReader: file → base64 data URI ────────────────────────────────

/**
 * Read an image File as a base64 data URI.
 * Returns { src: dataUrl, width, height } or null on error.
 */
export function readFileAsBase64(file, doc = document) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) { resolve(null); return; }

    const reader = new FileReader();

    reader.onload = async (e) => {
      const src = e.target.result;
      const dims = await measureImage(src, doc);
      resolve({ src, width: dims.width, height: dims.height });
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ─── 9.4 + 9.17 — fetch upload with progress + AbortController ───────────────

/**
 * Upload a file to uploadUrl via POST multipart/form-data.
 *
 * @param {File}     file        The image file to upload
 * @param {string}   uploadUrl   POST endpoint; must return JSON with `url` or `src`
 * @param {Function} onProgress  Called with (0–100) as upload progresses
 * @param {AbortSignal} signal   AbortController.signal — resolves null on abort
 * @param {Document} doc        For dimension measurement
 * @returns {Promise<{src, width, height}|null>}
 */
export async function uploadFile(file, uploadUrl, onProgress, signal, doc = document, config = {}) {
  if (!file || !uploadUrl) return null;

  const formData = new FormData();
  formData.append('file', file);

  let json;
  try {
    // Track upload progress via XHR — fetch has no upload progress API
    json = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error(`Image upload: server returned non-JSON (status ${xhr.status})`));
          }
        } else {
          reject(new Error(`Image upload failed: HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error',  () => reject(new Error('Image upload: network error')));
      xhr.addEventListener('abort',  () => resolve(null)); // AbortController path

      // 9.17 — wire AbortController signal to XHR abort
      if (signal) {
        if (signal.aborted) { xhr.abort(); resolve(null); return; }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    });
  } catch (err) {
    if (typeof onProgress === 'function') onProgress(0);
    // Let callers handle the error — don't swallow it silently here.
    // The plugin's install() wraps processImageFile in try/catch and emits 'error'.
    throw err;
  }

  if (!json) return null; // aborted (resolve(null)) or empty response

  // Resolve the hosted URL from the server's JSON. Order:
  //   1. a caller-supplied mapper `config.imageUploadResponse(json)` (Jodit's
  //      `process()` equivalent) — returns a URL string or { url, sources? };
  //   2. the common flat shapes `{ url }` / `{ src }`;
  //   3. the common NESTED shape `{ data: { url|src } }` (NestJS/Laravel-style)
  //      — previously unhandled, so those backends silently inserted nothing.
  let src = null;
  let mappedSources = null;
  if (typeof config.imageUploadResponse === 'function') {
    let mapped;
    try { mapped = config.imageUploadResponse(json); } catch { mapped = null; }
    if (typeof mapped === 'string') src = mapped;
    else if (mapped && typeof mapped === 'object') {
      src = mapped.url || mapped.src || null;
      if (Array.isArray(mapped.sources)) mappedSources = mapped.sources;
    }
  }
  if (!src) {
    const data = (json && typeof json.data === 'object' && json.data) || {};
    src = json.url || json.src || data.url || data.src || null;
  }
  if (!src) {
    // Explicit error instead of a silent no-op, so integrators immediately see
    // their response shape isn't recognized (and can add imageUploadResponse).
    throw new Error('Image upload: could not find a URL in the server response ' +
      '(expected { url } / { src } / { data: { url } }, or set imageUploadResponse).');
  }

  // Defense in depth: never trust the upload server's URL. A compromised or
  // misconfigured endpoint could return javascript:/data:/vbscript: — reject
  // it here so it never reaches createFigure. (sanitizeSrc also blocks it, but
  // failing at the boundary gives a clear error instead of a silent no-op.)
  if (isUnsafeUrl(src)) {
    throw new Error('Image upload: server returned an unsafe URL.');
  }

  const dims = await measureImage(src, doc);
  // 16.7.8 — optional responsive output: if the server returns a `sources`
  // array (each { srcset, media?, type?, sizes? }), pass it through so
  // createFigure wraps the <img> in a <picture>. Every srcset is still
  // scheme-checked in buildSources; a missing/invalid array is simply ignored.
  const result = { src, width: dims.width, height: dims.height };
  // Responsive sources: mapper-supplied wins, else the server's top-level array.
  const sources = mappedSources || (Array.isArray(json.sources) ? json.sources : null);
  if (sources) result.sources = sources;
  return result;
}

// ─── Shared: process a File object from any source (drop, paste, dialog) ─────

/**
 * Route a File through base64 or upload depending on editor config.
 * Returns { src, width, height } or null.
 * Calls onProgress(pct) during upload.
 * signal is an AbortSignal — only used on the upload path.
 */
export async function processImageFile(file, config = {}, onProgress = null, signal = null, doc = document) {
  if (!file || !file.type.startsWith('image/')) return null;

  if (config.imageUploadUrl) {
    return uploadFile(file, config.imageUploadUrl, onProgress, signal, doc, config);
  }
  return readFileAsBase64(file, doc);
}
