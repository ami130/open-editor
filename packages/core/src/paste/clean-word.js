/**
 * clean-word.js — Phase 12.C: strip Microsoft Word / Office garbage.
 *
 * Runs AFTER the security sanitizer (pipeline stage 0), which has already
 * unwrapped the non-whitelisted Office tags (<o:p>, <w:*>, <v:*>, <xml>,
 * <style>) and dropped comments/conditional-comments. What still survives and
 * this stage removes:
 *   • fake list bullets — <span style="mso-list:Ignore">·…</span> (the literal
 *     Symbol/Wingdings bullet glyph Word emits before each list item)
 *   • Word CSS classes — class="MsoNormal", "MsoListParagraph", any "Mso…"
 *   • mso-* inline style properties (mso-margin, mso-fareast-…, etc.)
 *
 * DELIBERATELY PRESERVED: the `mso-list:lN levelM lfoK` marker on list
 * paragraphs. That is the ONLY signal telling 12.D which paragraphs are list
 * items and at what nesting level, so list reconstruction (12.D) consumes and
 * removes it later. Stripping it here would make real <ul>/<ol> rebuild
 * impossible — this is the ordering that lets us EXCEED Jodit (which never
 * rebuilds Word lists at all).
 *
 * Pure `(html, ctx?) → html`. Parses into a detached container, mutates, and
 * serializes — never touches the live editor DOM.
 */

const MSO_CLASS = /^Mso/i;
// A mso-* declaration inside a style attribute, e.g. "mso-fareast-font:x;".
// We strip ALL mso-* props here, then re-attach only a genuine list marker
// (`mso-list:lN levelM …`) below — `mso-list:none` and friends are noise and
// must go. The real marker is the sole signal 12.D uses to rebuild lists.
const MSO_STYLE_DECL = /(?:^|;)\s*mso-[a-z-]+\s*:[^;]*/gi;
// A genuine Word list marker: mso-list:l0 level1 lfo1 (l<digits> level<digits>).
const MSO_LIST_MARKER = /mso-list\s*:\s*(l\d+\s+level\d+[^;"']*)/i;

function getDoc(ctx) {
  if (ctx && ctx.editor && ctx.editor._iframeDoc) return ctx.editor._iframeDoc;
  return typeof document !== 'undefined' ? document : null;
}

/** Strip Mso* class tokens; return the remaining class string (may be ''). */
function cleanClassAttr(value) {
  return String(value)
    .split(/\s+/)
    .filter((c) => c && !MSO_CLASS.test(c))
    .join(' ');
}

/**
 * Remove mso-* declarations from a style string, but if the original carried a
 * genuine list marker (`mso-list:lN levelM`) re-attach just that one, so 12.D
 * can still find it. `mso-list:none` and every other mso-* prop is dropped.
 */
function cleanStyleAttr(value) {
  const original = String(value);
  const marker = original.match(MSO_LIST_MARKER);
  let out = original
    .replace(MSO_STYLE_DECL, '')
    .replace(/^\s*;+/, '')     // leading stray semicolons
    .replace(/;\s*;+/g, ';')   // collapsed double semicolons
    .replace(/;\s*$/, '')      // trailing semicolon
    .trim();
  if (marker) {
    out = out ? `${out};mso-list:${marker[1].trim()}` : `mso-list:${marker[1].trim()}`;
  }
  return out;
}

/** True when a <span> is a Word fake-bullet marker (mso-list:Ignore). */
function isFakeBullet(el) {
  const style = el.getAttribute('style') || '';
  return /mso-list\s*:\s*ignore/i.test(style);
}

/**
 * Decide ordered vs unordered from a fake-bullet span BEFORE it is deleted.
 * Symbol/Wingdings/Courier bullet glyphs (·, o, §, ▪) → unordered; a leading
 * digit or ordered-letter/roman token (1. a) i.) → ordered. This hint is the
 * only ordered/unordered signal that survives into 12.D, so we stamp it onto
 * the list paragraph as data-oe-list-type before removing the span.
 */
function bulletListType(span) {
  const style = span.getAttribute('style') || '';
  if (/font-family\s*:\s*(?:Symbol|Wingdings)/i.test(style)) return 'ul';
  const glyph = (span.textContent || '').trim();
  // Ordered if it starts with a number or a single ordered letter/roman + separator.
  if (/^\d+[.)]/.test(glyph) || /^[a-z][.)]/i.test(glyph) || /^[ivxlcdm]+[.)]/i.test(glyph)) return 'ol';
  return 'ul';
}

/** The nearest ancestor list paragraph carrying an mso-list level marker. */
function listParagraphOf(node, root) {
  let n = node.parentNode;
  while (n && n !== root) {
    if (n.nodeType === 1 && n.tagName === 'P' && /mso-list\s*:\s*l\d+/i.test(n.getAttribute('style') || '')) {
      return n;
    }
    n = n.parentNode;
  }
  return null;
}

export function cleanWord(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;

  const root = doc.createElement('div');
  root.innerHTML = html;

  // 1) Remove fake list-bullet spans — but first record ordered/unordered onto
  //    the owning list paragraph so 12.D can rebuild the right list type.
  root.querySelectorAll('span').forEach((span) => {
    if (!isFakeBullet(span)) return;
    const p = listParagraphOf(span, root);
    if (p && !p.hasAttribute('data-oe-list-type')) {
      p.setAttribute('data-oe-list-type', bulletListType(span));
    }
    span.remove();
  });

  // 2) Clean class + style on every element.
  root.querySelectorAll('*').forEach((el) => {
    if (el.hasAttribute('class')) {
      const cleaned = cleanClassAttr(el.getAttribute('class'));
      if (cleaned) el.setAttribute('class', cleaned);
      else el.removeAttribute('class');
    }
    if (el.hasAttribute('style')) {
      const cleaned = cleanStyleAttr(el.getAttribute('style'));
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    }
    // Word/Office leftovers that survive as attributes on kept elements.
    el.removeAttribute('lang');
  });

  return root.innerHTML;
}
