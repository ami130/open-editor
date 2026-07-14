/**
 * source-highlight.js — 16.7.7: pure HTML → highlighted-HTML tokenizer for the
 * source-view overlay. NO DOM, fully unit-testable. Takes raw HTML text and
 * returns an HTML STRING of classed <span>s (tag punctuation, tag names,
 * attribute names, attribute values, comments) with everything else escaped.
 *
 * SECURITY: every character of the input is HTML-escaped before it is placed
 * into the output, so the highlighted markup can never smuggle live tags — the
 * output is only ever assigned to the OVERLAY's innerHTML (a presentation
 * layer whose text is transparent behind the real textarea), and the actual
 * editable value stays the raw textarea string, which still re-enters the
 * document exclusively through the sanitizer on source-exit.
 *
 * Deliberately a lightweight highlighter, not a full HTML parser: it colors the
 * common structural tokens the way a code editor does. Malformed input degrades
 * gracefully to escaped plain text (never throws, never drops characters).
 */

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function span(cls, text) {
  return `<span class="oe-hl-${cls}">${esc(text)}</span>`;
}

// Highlight the INSIDE of a tag (between < and >): the tag name, then
// attribute name="value" pairs. `raw` excludes the surrounding </>.
function highlightTagInner(raw) {
  // Leading "/" (close tag) or "!" (declaration) stays with the name.
  const nameMatch = raw.match(/^([/!]?[a-zA-Z][\w:-]*)/);
  if (!nameMatch) return esc(raw); // not a real tag body — escape verbatim
  let out = span('tag', nameMatch[1]);
  const rest = raw.slice(nameMatch[1].length);

  // Tokenize the remainder into attr-name / =value / whitespace runs.
  const attrRe = /([a-zA-Z_:][\w:.-]*)|(\s*=\s*)|("[^"]*"|'[^']*')|(\/)|(\s+)|([^]?)/g;
  let m;
  while ((m = attrRe.exec(rest)) !== null) {
    if (m[0] === '') break;
    if (m[1]) out += span('attr', m[1]);        // attribute name
    else if (m[2]) out += esc(m[2]);             // the = (plain)
    else if (m[3]) out += span('str', m[3]);     // quoted value
    else if (m[4]) out += esc('/');              // self-close slash
    else out += esc(m[0]);                       // whitespace / stray char
  }
  return out;
}

/**
 * Highlight raw HTML into an HTML string of classed spans. Splits on comments
 * and tags; text between them is escaped plain content.
 */
export function highlightHtml(input) {
  if (typeof input !== 'string' || input === '') return '';
  let out = '';
  // Alternation: HTML comment | any tag | run of plain text.
  const re = /(<!--[\s\S]*?-->)|(<[^>]*>)|([^<]+)/g;
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m[1]) {
      out += span('comment', m[1]);
    } else if (m[2]) {
      const inner = m[2].slice(1, -1); // strip < >
      out += `<span class="oe-hl-punct">&lt;</span>${highlightTagInner(inner)}<span class="oe-hl-punct">&gt;</span>`;
    } else if (m[3]) {
      out += esc(m[3]);
    }
  }
  return out;
}
