/**
 * clean-gdocs.test.js — Phase 12.E: Google Docs garbage removal.
 * Runs on already-security-sanitized HTML (the guid <b> wrapper is already
 * unwrapped by then), so we sanitize the raw fixture first.
 */
import { describe, it, expect } from 'vitest';
import { cleanGDocs } from '../src/paste/clean-gdocs.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { GDOCS_PARAGRAPH, GENERIC_PARAGRAPH } from './fixtures/paste-fixtures.js';

const s = (html) => sanitize(html, { document });
const clean = (html) => cleanGDocs(s(html), { editor: null });

describe('cleanGDocs — paragraph paste', () => {
  const out = clean(GDOCS_PARAGRAPH);

  it('strips GDocs noise style props (line-height, margins, font-family/size)', () => {
    expect(out).not.toMatch(/line-height/);
    expect(out).not.toMatch(/margin-top/);
    expect(out).not.toMatch(/margin-bottom/);
    expect(out).not.toMatch(/font-family/);
    expect(out).not.toMatch(/font-size/);
  });

  it('strips the default black color noise', () => {
    expect(out).not.toMatch(/color:#000000/i);
  });

  it('removes the dir="ltr" stamp', () => {
    expect(out).not.toMatch(/dir="ltr"/);
  });

  it('PRESERVES semantic style hints for 12.F promotion', () => {
    expect(out).toMatch(/font-weight:700/);       // → <strong>
    expect(out).toMatch(/font-style:italic/);     // → <em>
    expect(out).toMatch(/text-decoration:underline/); // → <u>
  });

  it('keeps all the text content', () => {
    expect(out).toMatch(/Plain then/);
    expect(out).toMatch(/bold/);
    expect(out).toMatch(/and italic/);
    expect(out).toMatch(/underlined/);
  });

  it('does not leave stray empty style="" attributes', () => {
    expect(out).not.toMatch(/style=""/);
  });
});

describe('cleanGDocs — wrapper removal & safety', () => {
  it('unwraps a residual docs-internal-guid element, keeping children', () => {
    const html = '<b id="docs-internal-guid-xyz" style="font-weight:normal"><p>kept</p></b>';
    const out = cleanGDocs(html, { editor: null });
    expect(out).not.toMatch(/docs-internal-guid/);
    expect(out).toMatch(/<p>kept<\/p>/);
  });

  it('leaves generic HTML untouched (semantic tags preserved)', () => {
    const out = cleanGDocs(s(GENERIC_PARAGRAPH), { editor: null });
    expect(out).toMatch(/<strong>normal<\/strong>/);
    expect(out).toMatch(/href="https:\/\/example\.com"/);
  });

  it('returns empty / non-string input unchanged', () => {
    expect(cleanGDocs('', {})).toBe('');
    expect(cleanGDocs(null, {})).toBe(null);
  });
});
