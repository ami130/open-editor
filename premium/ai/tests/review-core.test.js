import { describe, it, expect } from 'vitest';
import { reviewPrompt, parseReview, applyReplacement } from '../src/review-core.js';
import { translatePrompt, TRANSLATE_LANGUAGES } from '../src/prompts.js';

describe('reviewPrompt', () => {
  it('embeds the text and demands a JSON-array response', () => {
    const r = reviewPrompt('some text');
    expect(r.prompt).toContain('some text');
    expect(r.system).toMatch(/JSON array/i);
  });
});

describe('parseReview', () => {
  it('parses a bare JSON array', () => {
    const out = parseReview('[{"original":"teh","suggestion":"the","reason":"typo"}]');
    expect(out).toEqual([{ original: 'teh', suggestion: 'the', reason: 'typo' }]);
  });
  it('parses a ```json fenced block', () => {
    const out = parseReview('```json\n[{"original":"a","suggestion":"b"}]\n```');
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ original: 'a', suggestion: 'b', reason: '' });
  });
  it('extracts the array from surrounding prose', () => {
    const out = parseReview('Here are the fixes: [{"original":"x","suggestion":"y"}] Done.');
    expect(out.length).toBe(1);
  });
  it('drops malformed / empty / no-op / duplicate suggestions', () => {
    const out = parseReview(JSON.stringify([
      { original: 'same', suggestion: 'same' },        // no-op
      { original: '', suggestion: 'x' },               // empty original
      { original: 'a' },                                // missing suggestion
      { original: 'good', suggestion: 'better', reason: 'clarity' },
      { original: 'good', suggestion: 'better' },       // duplicate
    ]));
    expect(out).toEqual([{ original: 'good', suggestion: 'better', reason: 'clarity' }]);
  });
  it('returns [] on unparseable / empty / non-array', () => {
    expect(parseReview('not json')).toEqual([]);
    expect(parseReview('')).toEqual([]);
    expect(parseReview('{"original":"x"}')).toEqual([]); // object, not array
    expect(parseReview(null)).toEqual([]);
  });
});

describe('applyReplacement', () => {
  it('replaces the first occurrence, reports replaced', () => {
    expect(applyReplacement('teh cat teh dog', 'teh', 'the'))
      .toEqual({ text: 'the cat teh dog', replaced: true });
  });
  it('leaves text unchanged + replaced:false when original not found (stale)', () => {
    expect(applyReplacement('hello', 'xyz', 'abc')).toEqual({ text: 'hello', replaced: false });
  });
});

describe('translatePrompt', () => {
  it('targets the requested language (default English)', () => {
    expect(translatePrompt('hola', 'French').prompt).toMatch(/French/);
    expect(translatePrompt('x').prompt).toMatch(/English/);
  });
  it('ships a sensible default language list', () => {
    expect(TRANSLATE_LANGUAGES).toContain('Spanish');
    expect(TRANSLATE_LANGUAGES.length).toBeGreaterThanOrEqual(8);
  });
});
