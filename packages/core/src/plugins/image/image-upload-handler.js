/**
 * image-upload-handler.js — the customer-supplied upload handler (T12, §1.6).
 *
 * Split out of image-upload.js to stay inside the 300-line source limit, and
 * because it is a genuinely separate concern: image-upload.js owns OUR upload
 * (XHR + multipart), this owns handing the upload to the CUSTOMER entirely.
 */
import { measureImage } from './image-upload.js';
import { isUnsafeUrl } from '../../sanitizer/sanitizer-utils.js';

/**
 * Run a customer-supplied upload handler and normalise its result.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `imageUploadUrl` can express exactly one thing: POST multipart to a single
 * URL. That covers a plain backend endpoint and nothing else. It cannot express
 *
 *   • S3 / R2 pre-signed URLs — ask your API for a URL, then PUT the raw bytes
 *   • Cloudinary / Uploadcare signed flows — a signature request, then upload
 *   • anything needing two round-trips, a different verb, or a non-multipart body
 *
 * Customers on those flows previously had no path at all: they had to stand up
 * a proxy endpoint whose only job was to re-shape a request. The handler lets
 * them keep the upload entirely in their own code.
 *
 * ─── THE CONTRACT ───────────────────────────────────────────────────────────
 *   imageUploadHandler(file, { signal, onProgress }) → string
 *                                                    | { url|src, width?, height?, sources? }
 *
 * `signal` and `onProgress` are passed through deliberately: without them the
 * cancel button and the progress bar silently stop working on the one path
 * customers reach for precisely because their needs are complex.
 *
 * The returned URL gets the SAME treatment as a server-returned one — the
 * unsafe-scheme check and dimension measurement below — because a handler is
 * still customer code, and a bug there must not become an XSS in ours.
 *
 * @returns {Promise<{src, width, height, sources?}|null>} null when aborted
 */
export async function runUploadHandler(file, config = {}, onProgress = null, signal = null, doc = document) {
  const handler = config.imageUploadHandler;
  if (typeof handler !== 'function') return null;

  const raw = await handler(file, {
    signal,
    onProgress: typeof onProgress === 'function' ? onProgress : () => {},
  });

  // A handler that returns nothing after an abort is the documented way to say
  // "cancelled" — the same shape uploadFile uses, so callers need no new branch.
  if (raw == null) return null;
  if (signal?.aborted) return null;

  const out = typeof raw === 'string' ? { url: raw } : raw;
  const src = out?.url || out?.src || null;
  if (!src) {
    // Explicit rather than a silent no-op, so an integrator sees immediately
    // that their handler returned the wrong shape.
    throw new Error(
      'imageUploadHandler must resolve to a URL string or { url } — got '
      + `${typeof raw}. Return the hosted URL of the uploaded file.`,
    );
  }

  // Never trust the URL, even from customer code: a bug in a handler could
  // return javascript:/data:, and failing at the boundary gives a clear error
  // instead of letting the sanitizer silently drop the image later.
  if (isUnsafeUrl(src)) {
    throw new Error('imageUploadHandler returned an unsafe URL.');
  }

  // A handler that already knows the dimensions (common with an image CDN that
  // reports them) can skip the extra network round-trip of measuring.
  const known = Number.isFinite(out.width) && Number.isFinite(out.height);
  const dims = known ? { width: out.width, height: out.height } : await measureImage(src, doc);

  const result = { src, width: dims.width, height: dims.height };
  if (Array.isArray(out.sources)) result.sources = out.sources;
  return result;
}

