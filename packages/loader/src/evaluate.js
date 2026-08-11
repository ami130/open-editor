/**
 * evaluate.js — turn verified source text into a live ES module (§1.5, T22).
 *
 * ─── WHY BLOB URLS ─────────────────────────────────────────────────────────
 * The engine is built as ESM, and T1 (encoded payload) plus "verify before
 * execute" mean we hold the source as TEXT by the time we run it. A plain
 * <script src> cannot be used: the browser would fetch and execute it directly,
 * leaving no point at which to verify the hash.
 *
 * Every remaining mechanism was measured against real CSP headers in Chromium,
 * Firefox and WebKit. The results were identical in all three:
 *
 *   customer CSP                       blob: import   data: import
 *   script-src 'self'                  blocked        blocked
 *   script-src 'self' blob:            WORKS          blocked
 *   script-src 'self' 'unsafe-eval'    blocked        blocked
 *   (no CSP)                           works          works
 *
 * So: `data:` is not even a fallback — any CSP blocks it. `unsafe-eval` is both
 * the worse directive AND ineffective. Blob URLs are the only mechanism that
 * works, and `script-src blob:` is therefore a hard integration requirement for
 * any customer running a CSP.
 *
 * Since that requirement is unavoidable, the loader's job is to make it
 * OBVIOUS. A CSP block otherwise surfaces as an opaque "Failed to fetch
 * dynamically imported module" and a blank container, which is exactly the kind
 * of dead end this project exists to remove.
 */

/** Message shown when a CSP blocks the blob: import — names the exact fix. */
export const CSP_HELP =
  '[open-editor] the browser blocked loading the editor engine. Your Content-Security-Policy '
  + "must allow blob: in script-src, e.g.  script-src 'self' blob:  — this is required because "
  + 'the engine is verified before it runs. If your CSP cannot be changed, use the npm package '
  + 'instead of runtime delivery.';

/**
 * Evaluate verified ESM source and return its module namespace.
 *
 * @param {string} source verified bundle text
 * @returns {Promise<object>} the module's exports
 */
export async function evaluateModule(source, { importImpl = (u) => import(/* @vite-ignore */ u) } = {}) {
  let url;
  try {
    url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  } catch (err) {
    throw new Error(
      `[open-editor] could not create a module URL: ${err?.message || err}`,
      { cause: err },
    );
  }

  try {
    return await importImpl(url);
  } catch (err) {
    // A CSP denial and a genuine syntax error both surface here, and they need
    // very different responses from the integrator — so they are separated.
    //
    // `cause` matters especially here: CSP detection is best-effort string
    // matching, so if we guess wrong the integrator still has the browser's
    // own error to work from rather than a misleading CSP hint alone.
    throw new Error(
      looksLikeCspDenial(err)
        ? CSP_HELP
        : `[open-editor] the engine failed to load: ${err?.message || err}`,
      { cause: err },
    );
  } finally {
    // Revoke either way: the module is already evaluated, and leaving the URL
    // alive leaks the whole ~600 KB blob for the lifetime of the document.
    URL.revokeObjectURL(url);
  }
}

/**
 * Is this error a CSP refusal rather than a broken bundle?
 *
 * Browsers deliberately keep these messages vague (revealing more would leak
 * information across origins), and each engine words it differently — the
 * strings below are the ones actually observed in Chromium, Firefox and
 * WebKit. Matching is best-effort by design: a false positive shows a CSP hint
 * for a genuine failure, which is a far cheaper mistake than leaving a real CSP
 * block undiagnosed.
 */
export function looksLikeCspDenial(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('content security policy')
    || msg.includes('failed to fetch dynamically imported module')  // Chromium
    || msg.includes('error loading dynamically imported module')    // Firefox
    || msg.includes('importing a module script failed')             // WebKit
    || msg.includes('refused to load');
}
