/**
 * image-dom.js — DOM factory helpers for the image plugin (9.13, 9.14, 9.18).
 *
 * All image insertions go through createFigure() / insertFigure() so the
 * <figure contenteditable="false"> island contract (9.18) is enforced in one place.
 */
import { isUnsafeUrl } from '../../sanitizer/sanitizer-utils.js';
import { sanitizeSrc, sanitizeSrcset } from './image-url.js';
import { insertFigure } from './image-dom-insert.js';

// Re-export the URL helpers so existing importers of image-dom.js keep working.
export { sanitizeSrc, sanitizeSrcset };
// insertFigure lives in image-dom-insert.js (split out to keep this file under
// the 300-line limit); imported above for local use + re-exported for importers.
export { insertFigure };

// ─── 9.13, 9.14, 9.18 — figure factory ──────────────────────────────────────

/**
 * 16.7.8 — build <source> elements from a `sources` array for a responsive
 * <picture>. Each entry: { srcset, media?, type?, sizes? }. Every srcset is
 * scheme-checked via sanitizeSrcset (the same policy as <img srcset>); a
 * source whose srcset is entirely unsafe/empty is dropped. Returns an array
 * of <source> elements (possibly empty).
 */
function buildSources(sources, config, doc) {
  const out = [];
  if (!Array.isArray(sources)) return out;
  for (const s of sources) {
    if (!s || !s.srcset) continue;
    const safe = sanitizeSrcset(s.srcset, config);
    if (!safe) continue;
    const el = doc.createElement('source');
    el.setAttribute('srcset', safe);
    if (s.media) el.setAttribute('media', s.media);
    if (s.type)  el.setAttribute('type', s.type);
    if (s.sizes) el.setAttribute('sizes', s.sizes);
    out.push(el);
  }
  return out;
}

/**
 * Build a <figure contenteditable="false"> island. opts: alt, title, width,
 * height, loading ('lazy'|'eager'), caption, alignment
 * ('left'|'center'|'right'|'inline'), srcset, sizes (srcset/sizes preserved,
 * not generated), and `sources` (16.7.8 — an array of responsive
 * { srcset, media?, type?, sizes? } that, when non-empty, wraps the <img> in
 * a <picture> with those <source>s before the <img> fallback). Returns null
 * when sanitizeSrc blocks the src.
 */
export function createFigure(src, opts = {}, config = {}, doc = document) {
  const safeSrc = sanitizeSrc(src, config);
  if (!safeSrc) return null;

  const figure = doc.createElement('figure');
  figure.className = 'oe-figure';
  figure.setAttribute('contenteditable', 'false');
  figure.setAttribute('data-oe-island', 'image');

  const img = doc.createElement('img');
  img.src = safeSrc;
  if (opts.alt   != null) img.alt   = opts.alt;
  if (opts.title)         img.title = opts.title;
  if (opts.width)         img.width  = opts.width;
  if (opts.height)        img.height = opts.height;
  // 9.3 — apply imageDefaultWidth to inserted images that carry no size, so
  // large source images don't dominate the editor. Written as a style width
  // (composes with drag-resize / properties, which also use img.style.width).
  if (!opts.width && !opts.height) {
    const dw = parseInt(config.imageDefaultWidth, 10);
    if (dw > 0) img.style.width = `${dw}px`;
  }
  // 9.14 — loading="lazy" by default
  img.loading = (config.imageLazyLoad === false) ? 'eager' : (opts.loading || 'lazy');
  // 9.12 — preserve srcset/sizes, but scheme-check every srcset candidate.
  if (opts.srcset) {
    const safeSrcset = sanitizeSrcset(opts.srcset, config);
    if (safeSrcset) img.setAttribute('srcset', safeSrcset);
  }
  if (opts.sizes)  img.setAttribute('sizes',  opts.sizes);

  // 16.7.8 — responsive <picture>: when the caller supplies multiple
  // resolutions, wrap the <img> (kept as the required fallback) in a
  // <picture> with a <source> per resolution. If no sources survive
  // scheme-checking, fall back to the bare <img> (no empty <picture>).
  const sources = buildSources(opts.sources, config, doc);
  if (sources.length) {
    const picture = doc.createElement('picture');
    for (const s of sources) picture.appendChild(s);
    picture.appendChild(img);
    figure.appendChild(picture);
  } else {
    figure.appendChild(img);
  }

  // 9.13 — figcaption always present; re-enables editing within the island
  const cap = doc.createElement('figcaption');
  cap.setAttribute('contenteditable', 'true');
  cap.setAttribute('data-oe-caption', '');
  cap.textContent = opts.caption || '';
  figure.appendChild(cap);

  if (opts.alignment) applyAlignment(figure, opts.alignment);

  return figure;
}

/**
 * image-H1 fix: build a figure from a resolved result and insert it. If
 * createFigure returns null (src blocked by sanitizeSrc — most often a data:
 * URI on the default config), emit a clear 'error' instead of silently dropping
 * the insert. Returns true when the figure was inserted.
 */
export function buildAndInsertFigure(editor, result, opts, config, doc, context) {
  // 16.7.8 — carry an optional server-supplied `sources` array through to the
  // <picture> factory without mutating the caller's opts. createFigure ignores
  // it when absent, so non-responsive uploads are unaffected.
  const figureOpts = result && Array.isArray(result.sources)
    ? { ...opts, sources: result.sources }
    : opts;
  const figure = createFigure(result.src, figureOpts, config, doc);
  if (figure) { insertFigure(editor, figure); return true; }
  if (typeof editor.emit === 'function') {
    const isData = typeof result.src === 'string' && /^\s*data:/i.test(result.src);
    const hint = isData
      ? ' Local image files become data: URIs, which are blocked by default — set imageUploadUrl to host them, or imageAllowDataUri: true to embed them inline.'
      : '';
    editor.emit('error', {
      error: new Error(`Image was blocked: its source is not allowed.${hint}`),
      context,
    });
  }
  return false;
}

/**
 * Place the caret at the (clientX, clientY) drop point so a dropped image lands
 * WHERE it was dropped — not at whatever the previous text selection was (the
 * #1 drag-drop bug). Uses the standard caret-from-point APIs (caretRangeFromPoint
 * in Chrome/Safari, caretPositionFromPoint in Firefox). If the point isn't
 * inside the editable, or the APIs are unavailable (jsdom), it's a safe no-op
 * and insertion falls back to the existing selection logic.
 */
export function placeCaretFromPoint(editor, clientX, clientY) {
  const root = editor.getEditorElement && editor.getEditorElement();
  const doc = root && root.ownerDocument;
  const win = doc && doc.defaultView;
  if (!root || !doc || !win) return false;
  let range = null;
  if (typeof doc.caretRangeFromPoint === 'function') {
    range = doc.caretRangeFromPoint(clientX, clientY);
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) { range = doc.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
  }
  // Only honor a point that lands inside the editable content.
  if (!range || !root.contains(range.startContainer)) return false;
  const sel = win.getSelection && win.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); return true; }
  return false;
}

// ─── 9.9 — alignment ──────────────────────────────────────────────────────────
export function applyAlignment(figure, alignment) {
  // CLASS-ONLY (2026-07-16): all alignment layout lives in the stylesheet
  // (.oe-figure--left/right/center/inline). Previously this ALSO wrote inline
  // float/display/margin, duplicating the CSS and drifting from it — and the
  // inline `margin: 0 auto` for center wiped the figure's vertical margin AND
  // couldn't center a full-width block. Toggling one class is the single source
  // of truth; any stale inline styles from older documents are cleared.
  figure.classList.remove('oe-figure--left', 'oe-figure--center',
                          'oe-figure--right', 'oe-figure--inline');
  // Clear inline styles a previous (pre-fix) version may have written, so the
  // class rules aren't overridden by higher-specificity leftovers.
  figure.style.cssFloat = '';
  figure.style.display = '';
  figure.style.margin = '';
  figure.style.marginLeft = '';
  figure.style.marginRight = '';

  const cls = { left: 'oe-figure--left', right: 'oe-figure--right',
                center: 'oe-figure--center', inline: 'oe-figure--inline' }[alignment];
  if (cls) figure.classList.add(cls);
}

// ─── 9.16 — wrap image in link ───────────────────────────────────────────────

/**
 * Wrap the <img> inside a figure in an <a href>.
 * If the img is already inside an <a>, updates the href.
 */
export function wrapInLink(figure, href) {
  if (!figure || !href) return;
  if (isUnsafeUrl(href)) return;  // block javascript:, data:, vbscript:, etc.
  const img = figure.querySelector('img');
  if (!img) return;

  const existingA = img.closest('a');
  if (existingA) {
    existingA.href = href;
    return;
  }

  const a = figure.ownerDocument.createElement('a');
  a.href   = href;
  a.target = '_blank';
  a.rel    = 'noopener noreferrer';
  img.parentNode.insertBefore(a, img);
  a.appendChild(img);
}
