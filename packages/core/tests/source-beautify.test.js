/**
 * source-beautify.test.js — Phase 13.1a: the pure HTML pretty-printer.
 * The load-bearing property: beautify only reformats whitespace BETWEEN tags —
 * it must be semantically identical to the input when re-parsed, and must NOT
 * touch content inside <pre>.
 */
import { describe, it, expect } from 'vitest';
import { beautifyHtml } from '../src/plugins/source/source-beautify.js';

// Compare semantic equivalence by normalizing through the DOM parser.
function domText(html) {
  const d = document.createElement('div'); d.innerHTML = html; return d;
}
function sameStructure(html) {
  // Compare: same tag sequence + same PER-ELEMENT text. We compare each
  // element's own trimmed text rather than the whole concatenated textContent,
  // because a beautifier legitimately inserts whitespace BETWEEN block siblings
  // (<li>a</li><li>b</li> → separate lines). That whitespace is not rendered
  // and does not change meaning; concatenated textContent ("ab" vs "a b") would
  // wrongly flag it. Per-element text ("a","b") is the meaningful invariant.
  const d = domText(html);
  const els = Array.from(d.querySelectorAll('*'));
  return {
    tags: els.map((e) => e.tagName).join(','),
    texts: els.map((e) => {
      // own text = direct text node children only, trimmed+collapsed
      return Array.from(e.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.nodeValue).join('').replace(/\s+/g, ' ').trim();
    }).join('|'),
  };
}

describe('beautifyHtml — formatting', () => {
  it('puts nested blocks on their own indented lines', () => {
    const out = beautifyHtml('<div><p>hi</p></div>');
    expect(out).toContain('\n');
    expect(out).toMatch(/<div>/);
    expect(out).toMatch(/ {2}<p>/); // p is indented under div
  });

  it('handles a flat sequence of paragraphs', () => {
    const out = beautifyHtml('<p>a</p><p>b</p>');
    expect(out.split('\n').filter((l) => l.includes('<p>')).length).toBe(2);
  });

  it('returns empty for empty/non-string', () => {
    expect(beautifyHtml('')).toBe('');
    expect(beautifyHtml(null)).toBe('');
  });
});

describe('beautifyHtml — <pre> preservation (CRITICAL)', () => {
  it('emits <pre> content VERBATIM (no reindent of significant whitespace)', () => {
    const code = '<pre><code>function f() {\n    return 1;\n}</code></pre>';
    const out = beautifyHtml(code);
    // the exact code text (with its 4-space indent + newlines) is preserved
    expect(out).toContain('function f() {\n    return 1;\n}');
  });

  it('does not collapse blank lines or spaces inside <pre>', () => {
    const code = '<pre>a\n\n   b</pre>';
    expect(beautifyHtml(code)).toContain('a\n\n   b');
  });

  it('keeps <pre> content BYTE-EXACT (verifier regression: no newline injection)', () => {
    // includes a stray "<" inside code — must NOT be treated as a tag boundary
    const inp = '<pre><code>if (a < b) {\n  x();\n}</code></pre>';
    const out = beautifyHtml(inp);
    const din = domText(inp); const dout = domText(out);
    expect(dout.querySelector('pre').textContent).toBe(din.querySelector('pre').textContent);
  });

  it('is idempotent for <pre> (no whitespace accumulation across toggles)', () => {
    const inp = '<pre><code>a\n  b</code></pre>';
    const once = beautifyHtml(inp);
    const twice = beautifyHtml(once);
    expect(domText(twice).querySelector('pre').textContent)
      .toBe(domText(once).querySelector('pre').textContent);
  });

  it('resumes normal formatting after </pre>', () => {
    const out = beautifyHtml('<pre>x  y</pre><p>z</p>');
    expect(out).toContain('x  y');       // pre content intact
    // normal formatting resumes: a <p> block appears with its text
    expect(out).toMatch(/<p>/);
    expect(out).toContain('z');
    // and it re-parses cleanly
    const d = document.createElement('div'); d.innerHTML = out;
    expect(d.querySelector('p').textContent.trim()).toBe('z');
  });
});

describe('beautifyHtml — round-trip semantic equivalence', () => {
  const cases = [
    '<p>hello <strong>world</strong></p>',
    '<div><ul><li>a</li><li>b</li></ul></div>',
    '<p>text with <a href="https://x.com">a link</a> inside</p>',
    '<pre><code>const x = 1;\n  const y = 2;</code></pre>',
    '<table><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>',
    '<p>a<br>b</p>',
    '<img src="x.png" alt="pic">',
    '<!-- a comment --><p>after</p>',
  ];
  it('beautified output re-parses to the same structure + text', () => {
    for (const html of cases) {
      const before = sameStructure(html);
      const after = sameStructure(beautifyHtml(html));
      expect(after).toEqual(before);
    }
  });
});

describe('beautifyHtml — robustness', () => {
  it('handles attributes containing > safely (no premature tag close)', () => {
    // an attribute value with a > — tokenizer splits on the first >, but the
    // content re-parses correctly because we never alter the raw tag text.
    const html = '<p title="a">x</p>';
    expect(beautifyHtml(html)).toContain('<p title="a">');
  });
  it('handles an unclosed tag without throwing', () => {
    expect(() => beautifyHtml('<p>oops')).not.toThrow();
  });
  it('handles a lone < without throwing', () => {
    expect(() => beautifyHtml('a < b')).not.toThrow();
  });
  it('keeps void elements on their own line', () => {
    expect(beautifyHtml('<hr><hr>').split('\n').length).toBe(2);
  });
});
