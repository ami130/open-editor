/**
 * source-highlight.test.js — 16.7.7: pure HTML syntax-highlight tokenizer for
 * the source-view overlay. The full overlay (scroll-synced layer) is verified
 * e2e in Playwright; this locks in the tokenization + the security-critical
 * escaping (the output is only ever set as overlay innerHTML).
 */
import { describe, it, expect } from 'vitest';
import { highlightHtml } from '../src/plugins/source/source-highlight.js';

describe('highlightHtml', () => {
  it('wraps tag punctuation, tag name, attribute name, and quoted value in classed spans', () => {
    const out = highlightHtml('<a href="x">');
    expect(out).toContain('oe-hl-punct'); // < and >
    expect(out).toContain('<span class="oe-hl-tag">a</span>');
    expect(out).toContain('<span class="oe-hl-attr">href</span>');
    expect(out).toContain('<span class="oe-hl-str">"x"</span>');
  });

  it('highlights a close tag (leading slash kept with the name)', () => {
    const out = highlightHtml('</div>');
    expect(out).toContain('<span class="oe-hl-tag">/div</span>');
  });

  it('highlights HTML comments as a single comment span', () => {
    const out = highlightHtml('<!-- hi -->');
    expect(out).toContain('oe-hl-comment');
    expect(out).toContain('hi');
  });

  it('escapes plain text content between tags (no raw < > &)', () => {
    const out = highlightHtml('<p>a &amp; b</p>');
    // The literal ">" from source becomes &gt; in output; never a raw ">" that
    // could close a span. And the text "a &amp; b" is double-escaped safely.
    expect(out).not.toMatch(/<p>/); // no raw live tag survived
    expect(out).toContain('&amp;amp;'); // the source "&amp;" is itself escaped
  });

  it('SECURITY: a script tag in the input is escaped, never emitted live', () => {
    const out = highlightHtml('<script>alert(1)</script>');
    // No live <script> in the output — the "<" became &lt; via the punct span.
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;'); // from the punct span content
    expect(out).toContain('oe-hl-tag'); // "script" tokenized as a tag name
  });

  it('SECURITY: an onerror attribute value is escaped inside a string span', () => {
    const out = highlightHtml('<img src=x onerror="alert(1)">');
    expect(out).toContain('<span class="oe-hl-attr">onerror</span>');
    expect(out).toContain('<span class="oe-hl-str">"alert(1)"</span>');
    // No live img tag.
    expect(out).not.toMatch(/<img /);
  });

  it('returns "" for empty or non-string input', () => {
    expect(highlightHtml('')).toBe('');
    expect(highlightHtml(null)).toBe('');
    expect(highlightHtml(undefined)).toBe('');
  });

  it('degrades gracefully on malformed input without throwing or dropping chars', () => {
    expect(() => highlightHtml('<<< not really html >>>')).not.toThrow();
    const out = highlightHtml('plain text no tags');
    expect(out).toBe('plain text no tags');
  });
});
