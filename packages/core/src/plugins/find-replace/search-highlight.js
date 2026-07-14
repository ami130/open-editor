/**
 * search-highlight.js — Phase 13.2: visual match highlighting via the CSS
 * Custom Highlight API (zero-dep, no DOM mutation). Feature-detected: when the
 * browser lacks it (or in jsdom), highlighting is a no-op and the plugin still
 * works (navigation + replace rely only on the pure search-core, not on this).
 *
 * Two named highlights: 'oe-find' for all matches, 'oe-find-active' for the
 * current one. The consumer registers the CSS `::highlight()` rules once.
 */
import { injectStyleOnce } from '../../utils/inject-style.js';

const ALL = 'oe-find-all';
const ACTIVE = 'oe-find-active';

/** True when the CSS Custom Highlight API is usable. */
export function highlightSupported(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  return !!(w && w.CSS && w.CSS.highlights && typeof w.Highlight === 'function');
}

/**
 * Paint `ranges` as the "all matches" highlight and `activeRange` as the
 * "current match" highlight. Ranges are DOM Ranges (from buildMatchRange).
 * No-op when unsupported. Returns true if it painted.
 */
export function paintHighlights(win, ranges, activeRange) {
  if (!highlightSupported(win)) return false;
  try {
    const all = new win.Highlight();
    for (const r of ranges) { if (r && r !== activeRange) all.add(r); }
    win.CSS.highlights.set(ALL, all);

    if (activeRange) {
      const active = new win.Highlight();
      active.add(activeRange);
      win.CSS.highlights.set(ACTIVE, active);
    } else {
      win.CSS.highlights.delete(ACTIVE);
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove all find highlights. No-op when unsupported. */
export function clearHighlights(win) {
  if (!highlightSupported(win)) return;
  try {
    win.CSS.highlights.delete(ALL);
    win.CSS.highlights.delete(ACTIVE);
  } catch { /* ignore */ }
}

/** Inject the ::highlight() CSS rules once (idempotent). */
export function injectHighlightStyles(doc) {
  injectStyleOnce(doc, 'oe-find-highlight-styles',
    `::highlight(${ALL}){background:#fde68a;color:inherit;}` +
    `::highlight(${ACTIVE}){background:#f59e0b;color:#111;}`);
}
