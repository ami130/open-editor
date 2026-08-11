/**
 * session.js — talk to POST /delivery/session (execution plan §1.5).
 *
 * One call, one answer: *who is this visitor, which engine build do they get,
 * and what may they use in it?* The response carries the bundle's URL and the
 * SHA-256 the loader must verify the downloaded bytes against.
 *
 * DESIGN NOTE — this module knows nothing about mounting, caching, or the
 * editor. It is the network boundary and nothing else, so it can be tested
 * without a browser.
 */

/**
 * How long we wait for /session before giving up and falling back.
 *
 * Written without numeric separators: the loader is built to the LOWEST
 * supported browser (T8) because it runs before anything else and must be able
 * to render a fallback on a browser the engine itself would not support.
 */
export const SESSION_TIMEOUT_MS = 10000;

/**
 * Everything the loader needs to fetch and mount an engine.
 * @typedef {object} Session
 * @property {string} sessionToken  short-lived, carries plan + features + version
 * @property {string} refreshToken  long-lived, rotated on use
 * @property {string} plan          'free' | 'premium'
 * @property {string[]} features    what this session may actually use
 * @property {string} version       the resolved engine version
 * @property {{key:string, sha256:string, url:string}} engine
 */

/**
 * Open a delivery session.
 *
 * @param {object} opts
 * @param {string} opts.endpoint   delivery API origin, no trailing slash
 * @param {string} [opts.licenceKey]
 * @param {string} [opts.installId]
 * @param {string} [opts.version]  explicit version request (customer pinning)
 * @param {typeof fetch} [opts.fetchImpl] injectable for tests
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<Session>}
 */
export async function openSession({
  endpoint,
  licenceKey = null,
  installId = null,
  version = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = SESSION_TIMEOUT_MS,
} = {}) {
  if (!endpoint) throw new Error('[open-editor] no delivery endpoint configured');

  // A hung request must not hang the page forever — the caller's fallback is
  // far better than an editor that never appears.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(`${endpoint}/delivery/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Origin travels as a header the browser sets itself — deliberately NOT
      // in the body, so a page cannot claim to be a domain it is not.
      body: JSON.stringify({
        ...(licenceKey ? { licenceKey } : {}),
        ...(installId ? { installId } : {}),
        ...(version ? { version } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    // `cause` keeps the original network error reachable: our message explains
    // WHAT failed, the cause explains why (DNS, TLS, offline, CORS…).
    throw new Error(
      err?.name === 'AbortError'
        ? `[open-editor] /delivery/session timed out after ${timeoutMs}ms`
        : `[open-editor] could not reach the delivery service: ${err?.message || err}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 404 is the honest "nothing is published yet" answer, and is worth naming
    // because it is an operator problem, not a customer one.
    throw new Error(
      res.status === 404
        ? '[open-editor] the delivery service has no engine version configured'
        : `[open-editor] /delivery/session failed with HTTP ${res.status}`,
    );
  }

  const session = await res.json();
  assertUsable(session);
  return session;
}

/**
 * Reject a response we cannot safely act on.
 *
 * Without the hash there is nothing to verify the download against, and
 * without a URL there is nothing to download — proceeding in either case would
 * turn a clear failure into a confusing one later.
 */
function assertUsable(s) {
  if (!s || typeof s !== 'object') throw new Error('[open-editor] malformed session response');
  if (!s.engine?.url) throw new Error('[open-editor] session response carries no engine URL');
  if (!/^[0-9a-f]{64}$/i.test(s.engine?.sha256 || '')) {
    throw new Error('[open-editor] session response carries no valid engine hash');
  }
}
