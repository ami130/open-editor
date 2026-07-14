/**
 * clean-gdocs.js — Phase 12.E: strip Google Docs garbage.
 *
 * Runs AFTER the security sanitizer, which has already unwrapped the signature
 * `<b id="docs-internal-guid-…" style="font-weight:normal">` wrapper (a non-
 * whitelisted <b> → unwrapped, children kept). What survives and this stage
 * cleans:
 *   • GDocs noise style props on <p>/<span>: line-height, margin-top/bottom,
 *     font-family, font-size, color:#000000 (default black), background-color
 *     that is transparent/white — clutter that carries no real formatting.
 *   • the `dir="ltr"` default direction attribute GDocs stamps on every block.
 *
 * DELIBERATELY PRESERVED: the semantic style hints — font-weight (bold),
 * font-style (italic), text-decoration (underline/strikethrough), and any
 * non-default color/background. 12.F promotes those to <strong>/<em>/<u>/<s>
 * (this is where we EXCEED Jodit, which never promotes GDocs style formatting).
 * Stripping them here would erase the formatting before 12.F could capture it.
 *
 * Pure `(html, ctx?) → html`.
 */

// Style properties that are pure GDocs noise → always removed.
const NOISE_PROPS = new Set([
  'line-height', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'font-family', 'font-size', 'orphans', 'widows', 'text-align-last',
  'vertical-align', 'white-space', '-webkit-text-decoration-skip', 'text-decoration-skip-ink',
]);

// Values that mean "no styling" for color/background → removed as noise.
const DEFAULT_COLOR = /^#000000$|^#000$|^black$|^rgb\(0,\s*0,\s*0\)$/i;
const TRANSPARENT_BG = /^transparent$|^#ffffff$|^#fff$|^white$|^rgb\(255,\s*255,\s*255\)$/i;

function getDoc(ctx) {
  if (ctx && ctx.editor && ctx.editor._iframeDoc) return ctx.editor._iframeDoc;
  return typeof document !== 'undefined' ? document : null;
}

/** Drop noise declarations from a style string; keep semantic ones. */
function cleanStyleAttr(value) {
  const kept = [];
  for (const decl of String(value).split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    if (NOISE_PROPS.has(prop)) continue;
    if (prop === 'color' && DEFAULT_COLOR.test(val)) continue;
    if (prop === 'background-color' && TRANSPARENT_BG.test(val)) continue;
    if (prop === 'background' && TRANSPARENT_BG.test(val)) continue;
    kept.push(`${prop}:${val}`);
  }
  return kept.join(';');
}

export function cleanGDocs(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;

  const root = doc.createElement('div');
  root.innerHTML = html;

  // Remove the guid <b>/<span> wrapper if the sanitizer left one intact
  // (belt-and-suspenders — normally already unwrapped).
  root.querySelectorAll('[id^="docs-internal-guid-"]').forEach((el) => {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
  });

  root.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('dir'); // GDocs stamps dir="ltr" everywhere
    if (el.hasAttribute('style')) {
      const cleaned = cleanStyleAttr(el.getAttribute('style'));
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    }
  });

  return root.innerHTML;
}
