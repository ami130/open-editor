import { describe, it, expect } from 'vitest';
import { fleschReadingEase, countSentences, syllablesInWord, words } from '../src/readability.js';

describe('countSentences', () => {
  it('counts terminal punctuation, floor of 1', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('no punctuation here')).toBe(1);
    expect(countSentences('')).toBe(1);
    expect(countSentences('Wait... really?')).toBe(2); // ellipsis is one group
  });
});

describe('syllablesInWord', () => {
  it('short words are one syllable', () => {
    expect(syllablesInWord('cat')).toBe(1);
    expect(syllablesInWord('a')).toBe(1);
  });
  it('estimates multi-syllable words in the right ballpark', () => {
    expect(syllablesInWord('table')).toBeGreaterThanOrEqual(1);
    expect(syllablesInWord('readability')).toBeGreaterThanOrEqual(4);
    expect(syllablesInWord('beautiful')).toBeGreaterThanOrEqual(3);
  });
  it('non-alpha collapses to safe values', () => {
    expect(syllablesInWord('123')).toBe(0);
  });
});

describe('words', () => {
  it('tokenizes on non-alphanumerics, keeps apostrophes', () => {
    expect(words("It's a test, really.")).toEqual(["it's", 'a', 'test', 'really']);
  });

  it('C2 — accented Latin is kept whole (café, naïve, Zürich), not truncated', () => {
    expect(words('café naïve Zürich')).toEqual(['café', 'naïve', 'zürich']);
  });

  it('C2 — non-Latin scripts tokenize (Cyrillic)', () => {
    expect(words('Москва')).toEqual(['москва']);
  });

  it('C2 — CJK counts each character as a word (no-space scripts)', () => {
    // 4 ideographs → 4 words (was 0 with the old ASCII-only regex)
    expect(words('中文内容').length).toBe(4);
  });

  it('C2 — mixed CJK + Latin counts both', () => {
    const w = words('hello 世界');
    expect(w).toContain('hello');
    expect(w.length).toBe(3); // hello + 世 + 界
  });

  it('C2 — empty / whitespace → no tokens', () => {
    expect(words('')).toEqual([]);
    expect(words('   ')).toEqual([]);
  });
});

describe('fleschReadingEase', () => {
  it('empty text returns a safe zero result', () => {
    expect(fleschReadingEase('')).toMatchObject({ score: 0, label: 'No text', words: 0 });
  });
  it('simple short sentences score as easy (high)', () => {
    const r = fleschReadingEase('The cat sat on the mat. The dog ran.');
    expect(r.score).toBeGreaterThan(70);
    expect(r.words).toBe(9);
  });
  it('long complex sentences score lower than simple ones', () => {
    const simple = fleschReadingEase('I run. You run. We run fast.').score;
    const complex = fleschReadingEase(
      'The comprehensive documentation elaborately articulated numerous sophisticated methodologies.').score;
    expect(complex).toBeLessThan(simple);
  });
  it('clamps into 0..100', () => {
    const r = fleschReadingEase('Go. Go. Go. Go. Go.');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
