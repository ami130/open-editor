/**
 * injectStyleOnce — inject a scoped stylesheet into a document exactly once.
 *
 * Phase 15.9 (CSP): the editor must work under a strict `Content-Security-Policy`
 * that forbids dynamically-injected inline styles. So the PRIMARY path uses
 * Constructable Stylesheets (`new CSSStyleSheet()` + `document.adoptedStyleSheets`)
 * — those are NOT `<style>` elements and are not governed by `style-src
 * 'unsafe-inline'`, so they load under `script-src 'self'` with no relaxation.
 *
 * FALLBACK: engines without constructable-stylesheet support (Safari < 16.4, and
 * jsdom in the unit suite) fall back to the classic `<style>`+textContent element.
 * Behaviour is identical either way; only the delivery mechanism differs.
 *
 * Every plugin/UI style module funnels through here, so the CSP swap is a
 * single-file change and the once-guard is uniform.
 *
 * @param {Document} doc  target document (host or iframe)
 * @param {string}   id   unique id used as the once-guard (and <style> id in fallback)
 * @param {string}   css  stylesheet text
 * @returns {boolean} true if injected this call, false if skipped (already present / no doc)
 */

// Per-document set of ids already adopted as constructable sheets. Constructable
// sheets aren't in the DOM, so getElementById can't guard them — we track ids on
// the document object itself (via a non-enumerable WeakMap-free marker map).
const ADOPTED = new WeakMap(); // doc → Set<id>

function supportsConstructable(doc) {
  // Feature-detect the full path we rely on: construct a sheet, replaceSync, and
  // an array-typed adoptedStyleSheets we can reassign. jsdom lacks replaceSync,
  // so this correctly returns false there and we take the <style> fallback.
  try {
    if (!doc || !doc.defaultView) return false;
    const W = doc.defaultView;
    if (typeof W.CSSStyleSheet !== 'function') return false;
    if (!('adoptedStyleSheets' in doc)) return false;
    const probe = new W.CSSStyleSheet();
    return typeof probe.replaceSync === 'function';
  } catch {
    return false;
  }
}

function injectViaAdopted(doc, id, css) {
  let ids = ADOPTED.get(doc);
  if (!ids) { ids = new Set(); ADOPTED.set(doc, ids); }
  if (ids.has(id)) return false;               // once-guard
  const W = doc.defaultView;
  const sheet = new W.CSSStyleSheet();
  sheet.replaceSync(css);
  // Reassign (append) without clobbering sheets other code adopted. Some engines
  // expose adoptedStyleSheets as a frozen array, so spread into a fresh array.
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  ids.add(id);
  return true;
}

function injectViaStyleTag(doc, id, css) {
  if (doc.getElementById(id)) return false;    // once-guard
  const s = doc.createElement('style');
  s.id = id;
  s.textContent = css;
  (doc.head || doc.documentElement).appendChild(s);
  return true;
}

export function injectStyleOnce(doc, id, css) {
  if (!doc) return false;
  return supportsConstructable(doc)
    ? injectViaAdopted(doc, id, css)
    : injectViaStyleTag(doc, id, css);
}
