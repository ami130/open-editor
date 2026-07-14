/**
 * source-beautify.js — Phase 13.1: a tiny, zero-dependency HTML pretty-printer
 * for the Source Code view. NOT a parser/validator — a formatter. It only adds
 * newlines + indentation between tags; it never changes text content, attribute
 * values, or tag structure, so the beautified string is semantically identical
 * to the input (round-trip safe).
 *
 * CRITICAL: content inside <pre> (and <textarea>/<script>/<style>) is emitted
 * VERBATIM — reindenting it would corrupt significant whitespace (code!). We
 * track a "preformatted depth" and suspend all formatting while inside one.
 *
 * Pure `(html: string) → string`. No DOM, no editor.
 */

// Elements whose inner whitespace is significant → emit verbatim, no reflow.
const RAW_ELEMENTS = new Set(['pre', 'textarea', 'script', 'style']);
// Inline elements: don't force a newline around them (keeps <strong> etc. tight).
const INLINE = new Set(['a', 'b', 'i', 'u', 's', 'em', 'strong', 'span', 'sub', 'sup',
  'code', 'mark', 'small', 'abbr', 'cite', 'q', 'br', 'img', 'wbr', 'del', 'ins', 'font']);
// Void elements (no closing tag).
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

const INDENT = '  ';

// Tokenize into { type: 'tag'|'text'|'comment', value, name?, kind? }.
// kind for tags: 'open' | 'close' | 'void' | 'self'.
function tokenize(html) {
  const tokens = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { tokens.push({ type: 'text', value: html.slice(i) }); break; }
    if (lt > i) tokens.push({ type: 'text', value: html.slice(i, lt) });

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const to = end === -1 ? n : end + 3;
      tokens.push({ type: 'comment', value: html.slice(lt, to) });
      i = to; continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt === -1) { tokens.push({ type: 'text', value: html.slice(lt) }); break; }
    const raw = html.slice(lt, gt + 1);
    const inner = raw.slice(1, -1).trim();
    const isClose = inner.startsWith('/');
    const name = (isClose ? inner.slice(1) : inner).split(/[\s/>]/)[0].toLowerCase();
    const selfClose = inner.endsWith('/');
    const kind = isClose ? 'close' : (VOID.has(name) ? 'void' : (selfClose ? 'self' : 'open'));
    tokens.push({ type: 'tag', value: raw, name, kind });
    i = gt + 1;
  }
  return tokens;
}

// Split the HTML into segments so raw regions (<pre>…</pre> etc.) can be kept
// 100% VERBATIM. A raw segment spans from a raw-element open tag through its
// matching close tag, inclusive — extracted from the ORIGINAL string, never
// re-tokenized (so a stray `<` inside code, significant whitespace, and blank
// lines are all preserved byte-for-byte). Returns [{raw:bool, text}].
function splitRawSegments(html) {
  const segs = [];
  const re = new RegExp(`<(${[...RAW_ELEMENTS].join('|')})(\\s[^>]*)?>`, 'i');
  let rest = html;
  while (rest) {
    const m = rest.match(re);
    if (!m) { segs.push({ raw: false, text: rest }); break; }
    const openIdx = m.index;
    if (openIdx > 0) segs.push({ raw: false, text: rest.slice(0, openIdx) });
    const name = m[1].toLowerCase();
    // Find the matching close tag from the open tag's end.
    const afterOpen = openIdx + m[0].length;
    const closeRe = new RegExp(`</${name}\\s*>`, 'i');
    const closeM = rest.slice(afterOpen).match(closeRe);
    if (!closeM) { segs.push({ raw: true, text: rest.slice(openIdx) }); break; }
    const closeEnd = afterOpen + closeM.index + closeM[0].length;
    segs.push({ raw: true, text: rest.slice(openIdx, closeEnd) });
    rest = rest.slice(closeEnd);
  }
  return segs;
}

export function beautifyHtml(html) {
  if (typeof html !== 'string' || html === '') return '';
  const out = [];
  let depth = 0;
  let inline = '';
  const pad = () => INDENT.repeat(Math.max(0, depth));
  // Inline text/tags are NEVER split across lines — a newline between them would
  // re-parse as significant whitespace and change content (a<br>b → "a b").
  const flushInline = () => {
    const t = inline.replace(/\s+/g, ' ').trim();
    if (t) out.push(pad() + t);
    inline = '';
  };

  for (const seg of splitRawSegments(html)) {
    if (seg.raw) {
      // Emit a raw region VERBATIM on its own line — no reflow, no added
      // whitespace inside it (preserves <pre> code exactly, round-trip safe).
      flushInline();
      out.push(pad() + seg.text);
      continue;
    }
    for (const tok of tokenize(seg.text)) {
      if (tok.type === 'text') { inline += tok.value; continue; }
      if (tok.type === 'comment') { flushInline(); out.push(pad() + tok.value); continue; }
      if (INLINE.has(tok.name)) { inline += tok.value; continue; } // inline tag stays on the line
      flushInline();
      if (tok.kind === 'close') { depth = Math.max(0, depth - 1); out.push(pad() + tok.value); }
      else if (tok.kind === 'open') { out.push(pad() + tok.value); depth++; }
      else out.push(pad() + tok.value); // void / self-closing block
    }
  }
  flushInline();
  return out.join('\n');
}
