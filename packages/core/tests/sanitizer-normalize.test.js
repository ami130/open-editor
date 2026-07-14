import { describe, it, expect } from 'vitest';
import { sanitize, normalizeEncoding } from '../src/sanitizer/sanitizer.js';

// Helper: sanitize with jsdom's document
function s(html, opts = {}) {
  return sanitize(html, { ...opts, document });
}

// ─── 2.7 — Strip <script> and on* event attributes ───────────────────────────

describe('2.18 — content structural normalization', () => {
  it('unwraps <p> nested directly inside <p>', () => {
    // Malformed HTML: inner <p> must be flattened into outer <p>
    const out = s('<p>outer<p>inner</p></p>');
    // Result must contain both words and must not have nested <p>
    expect(out).toContain('outer');
    expect(out).toContain('inner');
    // After normalization there should be no <p> that contains another <p>
    const tmp = document.createElement('div');
    tmp.innerHTML = out;
    const nestedPs = tmp.querySelectorAll('p p');
    expect(nestedPs.length).toBe(0);
  });

  it('flattens inline element wrapping a block element', () => {
    // <span> wrapping a <p> is invalid HTML — span must be removed, <p> kept
    const out = s('<span><p>block inside inline</p></span>');
    expect(out).toContain('block inside inline');
    expect(out).toContain('<p>');
    // The outer <span> should be removed (it wrapped a block)
    expect(out).not.toContain('<span><p>');
  });

  it('flattens <strong> wrapping a block element', () => {
    const out = s('<strong><p>bold block</p></strong>');
    expect(out).toContain('bold block');
    expect(out).toContain('<p>');
    expect(out).not.toContain('<strong><p>');
  });

  it('preserves valid nesting untouched', () => {
    const input = '<p>Normal <strong>bold</strong> text</p>';
    const out = s(input);
    expect(out).toContain('<p>');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('cite attribute with javascript: scheme is stripped', () => {
    const out = s('<blockquote cite="javascript:evil()">quote</blockquote>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('quote');
  });

  it('cite attribute with safe URL is preserved', () => {
    const out = s('<blockquote cite="https://example.com">quote</blockquote>');
    expect(out).toContain('cite="https://example.com"');
  });

  it('cite attribute with data: scheme is stripped', () => {
    const out = s('<q cite="data:text/html,evil">text</q>');
    expect(out).not.toContain('data:');
  });
});

// ─── 2.26 — sanitize:false escape hatch ──────────────────────────────────────

describe('2.26 — sanitize:false bypass', () => {
  it('passes HTML through unchanged when sanitize option is false (tested via editor)', () => {
    // sanitize() itself always sanitizes; the escape hatch lives in editor.setHTML
    // Here we verify sanitize() always cleans
    const dangerous = '<p onclick="evil()">text</p>';
    const out = s(dangerous);
    expect(out).not.toContain('onclick');
  });
});

// ─── 2.17 — Encoding normalization ───────────────────────────────────────

describe('2.17 — character encoding normalization', () => {
  it('normalizeEncoding: strips BOM at start of string', () => {
    const out = normalizeEncoding('\uFEFFhello');
    expect(out).toBe('hello');
  });

  it('normalizeEncoding: strips mid-string BOM (mXSS zero-width)', () => {
    const out = normalizeEncoding('hel\uFEFFlo');
    expect(out).toBe('hello');
  });

  it('normalizeEncoding: strips ZWSP/ZWNJ but PRESERVES ZWJ (emoji combiner)', () => {
    // U+200B (ZWSP) and U+200C (ZWNJ) are stripped, but U+200D (ZWJ) is kept so
    // emoji sequences like family/profession emoji survive. ZWJ is not a
    // tag/attribute delimiter, so keeping it does not reopen an mXSS vector.
    const result = normalizeEncoding('a\u200Bb\u200Cc\u200Dd');
    expect(result).toBe('abc\u200Dd');
  });

  it('normalizeEncoding: preserves a full emoji ZWJ sequence', () => {
    // \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 = man + ZWJ + woman + ZWJ + girl
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(normalizeEncoding(family)).toBe(family);
  });

  it('normalizeEncoding: plain ASCII passes through unchanged', () => {
    const str = 'Hello World 123';
    expect(normalizeEncoding(str)).toBe(str);
  });

  it('normalizeEncoding: empty string passes through', () => {
    expect(normalizeEncoding('')).toBe('');
  });

  it('sanitize: preserves smart single quotes in text content (H-7 fix)', () => {
    // Smart quotes are valid author typography \u2014 must NOT be converted to ASCII.
    const out = s('<p>\u2018hello\u2019</p>', { document });
    expect(out).toContain('\u2018hello\u2019');
  });

  it('sanitize: preserves smart double quotes in text content (H-7 fix)', () => {
    const out = s('<p>\u201Chello\u201D</p>', { document });
    expect(out).toContain('\u201Chello\u201D');
  });

  it('sanitize: preserves en dash in text content (H-7 fix)', () => {
    const out = s('<p>x\u2013y</p>', { document });
    expect(out).toContain('x\u2013y');
    expect(out).not.toContain('x--y');
  });

  it('sanitize: preserves em dash in text content (H-7 fix)', () => {
    const out = s('<p>x\u2014y</p>', { document });
    expect(out).toContain('x\u2014y');
    expect(out).not.toContain('x--y');
  });

  it('sanitize: converts non-breaking space in text content', () => {
    const out = s('<p>a\u00A0b</p>', { document });
    expect(out).toContain('a b');
  });

  it('sanitize: does NOT corrupt em dash inside href attribute', () => {
    // This was the bug: normalizeEncoding used to run on the raw string,
    // corrupting URLs with em dashes in them.
    const out = s('<a href="https://example.com/path\u2014here">link</a>', { document });
    // The href should NOT have been turned into ---
    // (after sanitization the href may be kept or stripped depending on safety,
    // but it must NOT have the dash turned into ---)
    expect(out).not.toContain('---');
  });
});


// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('sanitizer edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(s('')).toBe('');
    expect(s('   ')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
    expect(sanitize(42)).toBe('');
  });

  it('adds rel="noopener noreferrer" when target="_blank"', () => {
    const out = s('<a href="/x" target="_blank">link</a>');
    expect(out).toContain('noopener');
    expect(out).toContain('noreferrer');
  });

  it('preserves existing rel when adding noopener', () => {
    const out = s('<a href="/x" target="_blank" rel="nofollow">link</a>');
    expect(out).toContain('nofollow');
    expect(out).toContain('noopener');
  });

  it('preserves allowed safe HTML intact', () => {
    const input = '<h1>Title</h1><p>Para with <strong>bold</strong> and <em>italic</em>.</p>';
    const out = s(input);
    expect(out).toContain('<h1>');
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
  });

  it('unwraps unknown tags but keeps text content', () => {
    const out = s('<blink>visible</blink>');
    expect(out).not.toContain('<blink');
    expect(out).toContain('visible');
  });

  it('handles deeply nested scripts', () => {
    const out = s('<p><span><script>evil()</script>text</span></p>');
    expect(out).not.toContain('evil()');
    expect(out).toContain('text');
  });

  it('handles vbscript: scheme', () => {
    const out = s('<a href="vbscript:msgbox(1)">x</a>');
    expect(out).not.toContain('vbscript:');
  });
});

// ─── M3: smart-quote normalization skips pre/code ────────────────────────────

describe('M3 — normalizeTextNodes skips pre/code content', () => {
  it('preserves smart quotes inside <pre>', () => {
    const out = s('<pre>\u2018hello\u2019</pre>');
    expect(out).toContain('\u2018hello\u2019');
  });

  it('preserves smart quotes inside <code>', () => {
    const out = s('<code>\u201chello\u201d</code>');
    expect(out).toContain('\u201chello\u201d');
  });

  it('preserves smart quotes outside pre/code (H-7 fix - no longer converted)', () => {
    // Smart quotes are now preserved everywhere - the old conversion was destructive.
    const out = s('<p>\u2018hello\u2019</p>');
    expect(out).toContain('\u2018hello\u2019');
  });

  it('preserves em-dash inside <pre>', () => {
    const out = s('<pre>a\u2014b</pre>');
    expect(out).toContain('\u2014');
  });
});

describe('17.5.2 — empty blocks get a placeholder <br> (FF/WebKit caret target)', () => {
  it('setHTML("<p></p>") round-trips as a valid caret target', () => {
    expect(s('<p></p>')).toBe('<p><br></p>');
  });
  it('empty headings, cells, and list items are fixed too', () => {
    expect(s('<h2></h2>')).toBe('<h2><br></h2>');
    expect(s('<ul><li></li></ul>')).toBe('<ul><li><br></li></ul>');
    expect(s('<table><tbody><tr><td></td></tr></tbody></table>')).toContain('<td><br></td>');
  });
  it('non-empty blocks are untouched', () => {
    expect(s('<p>x</p>')).toBe('<p>x</p>');
    expect(s('<p><br></p>')).toBe('<p><br></p>');
  });
});
