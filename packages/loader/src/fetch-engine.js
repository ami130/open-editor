/**
 * fetch-engine.js — download the engine bundle and prove it is the right one
 * (execution plan §1.5).
 *
 * VERIFY BEFORE EXECUTE. The session response carries the bundle's SHA-256; we
 * hash what actually arrived and compare. A truncated download, a proxy that
 * "helpfully" rewrites JavaScript, or a poisoned cache entry would otherwise
 * execute broken code and fail somewhere far less obvious. The check costs a
 * few milliseconds against a ~600 KB payload and removes a whole class of
 * hard-to-trace bugs.
 */

/**
 * How long to wait for the bundle itself. Larger than /session: it is ~600 KB
 * and may arrive over a slow connection. Plain digits — see SESSION_TIMEOUT_MS.
 */
export const ENGINE_TIMEOUT_MS = 30000;

/**
 * Fetch the bundle and verify its integrity.
 *
 * @param {string} url     absolute URL from the session response
 * @param {string} sha256  the digest the session promised
 * @returns {Promise<string>} the verified source text
 */
export async function fetchEngine(url, sha256, {
  fetchImpl = globalThis.fetch,
  timeoutMs = ENGINE_TIMEOUT_MS,
} = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(url, { signal: ctrl.signal });
  } catch (err) {
    throw new Error(
      err?.name === 'AbortError'
        ? `[open-editor] engine download timed out after ${timeoutMs}ms`
        : `[open-editor] engine download failed: ${err?.message || err}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 403 on a premium bundle means the signed URL expired or was tampered
    // with; naming it saves a confusing investigation.
    throw new Error(
      res.status === 403
        ? '[open-editor] engine download was refused (expired or invalid signed URL)'
        : `[open-editor] engine download failed with HTTP ${res.status}`,
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = await digestHex(bytes);
  if (actual !== sha256.toLowerCase()) {
    throw new Error(
      '[open-editor] engine integrity check FAILED — the downloaded bundle does not '
      + `match the expected hash (expected ${sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…). `
      + 'This usually means a proxy modified the response or a cache is poisoned.',
    );
  }

  return new TextDecoder().decode(bytes);
}

/**
 * SHA-256 of the bytes, as lowercase hex.
 *
 * Uses WebCrypto, which is unavailable on insecure origins (plain http:// that
 * is not localhost). That is worth a clear message: the alternative would be
 * shipping a JS SHA-256 implementation in the one component that must stay
 * minimal (T16).
 */
export async function digestHex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[open-editor] WebCrypto is unavailable, so the engine bundle cannot be '
      + 'verified. This usually means the page is served over plain http:// — '
      + 'use https:// (or localhost) to load the editor.',
    );
  }
  const hash = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
