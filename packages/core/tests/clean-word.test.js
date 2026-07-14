/**
 * clean-word.test.js — Phase 12.C: Word/Office garbage removal.
 * Runs on already-security-sanitized HTML (that is the pipeline order), so we
 * sanitize the raw fixtures first, then assert cleanWord's effect.
 */
import { describe, it, expect } from 'vitest';
import { cleanWord } from '../src/paste/clean-word.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { WORD_PARAGRAPH, WORD_LIST, GENERIC_PARAGRAPH } from './fixtures/paste-fixtures.js';

const s = (html) => sanitize(html, { document });
const clean = (html) => cleanWord(s(html), { editor: null });

describe('cleanWord — paragraph paste', () => {
  const out = clean(WORD_PARAGRAPH);

  it('strips Mso* classes', () => {
    expect(out).not.toMatch(/Mso/);
    expect(out).not.toMatch(/class=/); // MsoNormal was the only class
  });

  it('strips mso-* inline style properties', () => {
    expect(out).not.toMatch(/mso-/);
  });

  it('keeps the real text content', () => {
    expect(out).toMatch(/Hello/);
    expect(out).toMatch(/bold/);
    expect(out).toMatch(/world/);
    // NOTE: the security sanitizer strips <b> (only <strong> is whitelisted),
    // so "bold" arrives as plain text here; <b>→<strong> remapping is a 12.F
    // concern, not Word cleanup's.
  });
});

describe('cleanWord — list paste', () => {
  const out = clean(WORD_LIST);

  it('removes the fake bullet glyph spans (mso-list:Ignore)', () => {
    // The literal · and o bullets and their spacing spans must be gone.
    expect(out).not.toMatch(/mso-list\s*:\s*ignore/i);
    expect(out).not.toMatch(/·/);
    expect(out).not.toMatch(/font:7\.0pt/);
  });

  it('PRESERVES the mso-list level markers for 12.D list reconstruction', () => {
    // These are the only signal for rebuilding real <ul>/<ol> — must survive.
    expect(out).toMatch(/mso-list:\s*l0 level1/i);
    expect(out).toMatch(/mso-list:\s*l0 level2/i);
  });

  it('keeps the list item text', () => {
    expect(out).toMatch(/First item/);
    expect(out).toMatch(/Second item/);
    expect(out).toMatch(/Nested item/);
  });
});

describe('cleanWord — safety & no-ops', () => {
  it('leaves generic (non-Word) HTML essentially untouched', () => {
    const generic = s(GENERIC_PARAGRAPH);
    const out = cleanWord(generic, { editor: null });
    expect(out).toMatch(/<strong>normal<\/strong>/);
    expect(out).toMatch(/href="https:\/\/example\.com"/);
  });

  it('returns empty/non-string input unchanged', () => {
    expect(cleanWord('', {})).toBe('');
    expect(cleanWord(null, {})).toBe(null);
  });

  it('does not leave stray empty style="" attributes', () => {
    const out = clean(WORD_PARAGRAPH);
    expect(out).not.toMatch(/style=""/);
    expect(out).not.toMatch(/style="\s*"/);
  });
});
