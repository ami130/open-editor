/**
 * word-lists.test.js — Phase 12.D: Word flat-paragraph → nested <ul>/<ol>.
 * The hardest paste transform; tested exhaustively.
 */
import { describe, it, expect } from 'vitest';
import { reconstructWordLists } from '../src/paste/word-lists.js';
import { cleanWord } from '../src/paste/clean-word.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { WORD_LIST } from './fixtures/paste-fixtures.js';

const ctx = { editor: null };
// A Word list paragraph as it looks entering 12.D (after sanitize + cleanWord).
const p = (level, type, text, listId = 0) =>
  `<p style="mso-list:l${listId} level${level} lfo1" data-oe-list-type="${type}">${text}</p>`;

describe('reconstructWordLists — flat single level', () => {
  it('turns consecutive level-1 items into one <ul>', () => {
    const out = reconstructWordLists(p(1, 'ul', 'A') + p(1, 'ul', 'B'), ctx);
    expect(out).toBe('<ul><li>A</li><li>B</li></ul>');
  });
  it('uses <ol> when the hint is ordered', () => {
    const out = reconstructWordLists(p(1, 'ol', 'A') + p(1, 'ol', 'B'), ctx);
    expect(out).toBe('<ol><li>A</li><li>B</li></ol>');
  });
});

describe('reconstructWordLists — nesting', () => {
  it('nests a level-2 item inside the preceding level-1 item', () => {
    const out = reconstructWordLists(p(1, 'ul', 'A') + p(2, 'ul', 'A1') + p(1, 'ul', 'B'), ctx);
    expect(out).toBe('<ul><li>A<ul><li>A1</li></ul></li><li>B</li></ul>');
  });
  it('handles multiple nested items then un-nests', () => {
    const html = p(1, 'ul', 'A') + p(2, 'ul', 'A1') + p(2, 'ul', 'A2') + p(1, 'ul', 'B');
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<ul><li>A<ul><li>A1</li><li>A2</li></ul></li><li>B</li></ul>');
  });
  it('handles three levels deep', () => {
    const html = p(1, 'ul', 'A') + p(2, 'ul', 'A1') + p(3, 'ul', 'A1a') + p(1, 'ul', 'B');
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<ul><li>A<ul><li>A1<ul><li>A1a</li></ul></li></ul></li><li>B</li></ul>');
  });
  it('mixes ordered outer with unordered nested', () => {
    const html = p(1, 'ol', 'A') + p(2, 'ul', 'A1') + p(1, 'ol', 'B');
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<ol><li>A<ul><li>A1</li></ul></li><li>B</li></ol>');
  });
});

describe('reconstructWordLists — boundaries & interleaving', () => {
  it('leaves non-list content before/after untouched', () => {
    const html = '<p>intro</p>' + p(1, 'ul', 'A') + p(1, 'ul', 'B') + '<p>outro</p>';
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<p>intro</p><ul><li>A</li><li>B</li></ul><p>outro</p>');
  });
  it('a normal paragraph between two lists splits them into two lists', () => {
    const html = p(1, 'ul', 'A') + '<p>mid</p>' + p(1, 'ol', 'X');
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<ul><li>A</li></ul><p>mid</p><ol><li>X</li></ol>');
  });
  it('ignores whitespace text nodes between list paragraphs (keeps the run)', () => {
    const html = p(1, 'ul', 'A') + '\n  ' + p(1, 'ul', 'B');
    const out = reconstructWordLists(html, ctx);
    expect(out).toBe('<ul><li>A</li><li>B</li></ul>');
  });
  it('does nothing to HTML with no list paragraphs', () => {
    expect(reconstructWordLists('<p>plain</p>', ctx)).toBe('<p>plain</p>');
  });
  it('returns empty/non-string input unchanged', () => {
    expect(reconstructWordLists('', ctx)).toBe('');
    expect(reconstructWordLists(null, ctx)).toBe(null);
  });
});

describe('reconstructWordLists — type correctness (D1/D2 regressions)', () => {
  it('D1: a level-1 ordered item keeps <ol> even when the run starts nested', () => {
    // run starts at level 2, then a level-1 ol item, then level 2 again.
    const out = reconstructWordLists(p(2, 'ul', 'A') + p(1, 'ol', 'B') + p(2, 'ul', 'C'), ctx);
    // the top-level list must be <ol> (B's type), not frozen to the first item's ul
    expect(out.startsWith('<ol>')).toBe(true);
    expect(out).toContain('<li>B');
  });

  it('D1b: nested list type comes from the nested item, not the parent', () => {
    const out = reconstructWordLists(p(1, 'ol', 'A') + p(2, 'ul', 'A1') + p(1, 'ol', 'B'), ctx);
    expect(out).toBe('<ol><li>A<ul><li>A1</li></ul></li><li>B</li></ol>');
  });

  it('D2: two distinct Word lists (different listId) split into two lists', () => {
    const out = reconstructWordLists(p(1, 'ul', 'A', 0) + p(1, 'ol', 'X', 1), ctx);
    expect(out).toBe('<ul><li>A</li></ul><ol><li>X</li></ol>');
  });

  it('D2b: same listId across items stays one list', () => {
    const out = reconstructWordLists(p(1, 'ul', 'A', 0) + p(1, 'ul', 'B', 0), ctx);
    expect(out).toBe('<ul><li>A</li><li>B</li></ul>');
  });

  it('phantom intermediate level defaults to <ul>, target level keeps its type', () => {
    // level 1 (ol) → jump to level 3 (ol): the phantom level-2 list is <ul>,
    // the real level-3 list is <ol>.
    const out = reconstructWordLists(p(1, 'ol', 'A') + p(3, 'ol', 'deep'), ctx);
    expect(out).toBe('<ol><li>A<ul><li><ol><li>deep</li></ol></li></ul></li></ol>');
  });
});

describe('reconstructWordLists — full fixture flow (sanitize → cleanWord → 12.D)', () => {
  it('rebuilds the WORD_LIST fixture into a nested <ul>', () => {
    let h = sanitize(WORD_LIST, { document });
    h = cleanWord(h, ctx);
    h = reconstructWordLists(h, ctx);
    // First + Second at level 1, Nested at level 2 → one <ul> with a nested <ul>.
    expect(h).toMatch(/<ul>/);
    expect(h).not.toMatch(/mso-list/);          // marker consumed
    expect(h).not.toMatch(/data-oe-list-type/); // hint consumed
    expect(h).not.toMatch(/<p[ >]/);            // no leftover list paragraphs
    expect(h.replace(/\s+/g, ' ')).toContain('<li>First item');
    expect(h.replace(/\s+/g, ' ')).toContain('<li>Second item');
    expect(h).toMatch(/<ul><li>[\s\S]*<ul><li>[\s\S]*Nested item/);
  });
});
