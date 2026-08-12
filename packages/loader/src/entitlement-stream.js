/**
 * entitlement-stream.js — the client half of §2.3 "instant upgrade push".
 *
 * ─── WHAT IT DOES ───────────────────────────────────────────────────────────
 * Holds an EventSource open to /delivery/events. When the backend says this
 * licence changed, we trigger the refresh the engine ALREADY performs on a
 * timer — just sooner. Upgrade lands in ~2s instead of up to 15 minutes.
 *
 * ─── IT IS AN OPTIMISATION, NEVER A DEPENDENCY ──────────────────────────────
 * Every failure path here degrades to "the timer handles it", which is the
 * pre-§2.3 behaviour and remains correct:
 *
 *   • no EventSource (old browser, SSR, jsdom)  → nothing scheduled
 *   • the endpoint 204s or errors               → browser retries; timer runs
 *   • the connection drops                      → EventSource auto-reconnects
 *   • the event never arrives                   → timer fires as it always did
 *
 * So this file is not allowed to throw into the load path, and it never blocks
 * the editor from mounting.
 *
 * ─── WHY IT REUSES THE ENGINE'S REFRESH ─────────────────────────────────────
 * The engine owns `_doLicenseRefresh()`: it re-verifies the token offline,
 * re-applies entitlements in place, re-arms its own timer, and tears down
 * revoked features WITHOUT touching the document. Re-implementing any of that
 * here would mean two code paths that must agree forever. We only make the
 * existing one happen earlier.
 */

/** Ignore bursts: a fulfilment can publish on two channels at once. */
const COALESCE_MS = 400;

/**
 * Subscribe to entitlement changes for this editor.
 *
 * @param {object} opts
 * @param {string}  opts.endpoint    delivery base URL
 * @param {string}  [opts.lic]       licence id, when known
 * @param {string}  [opts.installId] install id, for a not-yet-licensed browser
 * @param {Function} opts.onChange   called (coalesced) when something changed
 * @returns {Function} unsubscribe — always safe to call, even after failure
 */
export function subscribeEntitlements(opts = {}) {
  const {
    endpoint, lic = null, installId = null, onChange,
  } = opts;

  const noop = () => {};
  if (!endpoint || typeof onChange !== 'function') return noop;
  // No identity → nothing to subscribe to. The timer still covers this editor.
  if (!lic && !installId) return noop;

  const ES = globalThis.EventSource;
  if (typeof ES !== 'function') return noop;

  let source = null;
  let timer = null;
  let closed = false;

  try {
    const url = new URL(`${String(endpoint).replace(/\/$/, '')}/delivery/events`);
    // `lic` is preferred: it survives the browser clearing storage, and it is
    // the channel the backend publishes on for existing customers.
    if (lic) url.searchParams.set('lic', lic);
    else url.searchParams.set('installId', installId);

    source = new ES(url.toString());

    source.onmessage = (evt) => {
      if (closed) return;
      let reason = 'changed';
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed && typeof parsed.reason === 'string') reason = parsed.reason;
      } catch {
        // A malformed frame still means "something happened" — refresh anyway
        // rather than ignoring a real change because of a parse error.
      }
      // Coalesce: fulfilment publishes to the installId AND licId channels, and
      // a reconnect can replay. One refresh is enough.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try { onChange(reason); } catch { /* never surface into the stream */ }
      }, COALESCE_MS);
    };

    // No onerror handler that closes: EventSource reconnects on its own with
    // backoff, and closing here would turn a transient blip into a permanent
    // loss of push for the life of the page.
  } catch {
    return noop;
  }

  return function unsubscribe() {
    closed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    try { source?.close(); } catch { /* already gone */ }
  };
}
