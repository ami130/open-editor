import { describe, it, expect } from 'vitest';
import { fleschReadingEase, countSentences, splitSentences, syllablesInWord, words } from '../src/readability.js';

describe('countSentences', () => {
  it('counts terminal punctuation, floor of 1', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('no punctuation here')).toBe(1);
    expect(countSentences('')).toBe(1);
    expect(countSentences('Wait... really?')).toBe(2); // ellipsis is one group
  });
  it('C3 — does NOT split on abbreviations, initials, or decimals', () => {
    expect(countSentences('Dr. Smith went home.')).toBe(1);
    expect(countSentences('We use e.g. widgets and i.e. gadgets here.')).toBe(1);
    expect(countSentences('The U.S. economy grew.')).toBe(1);
    expect(countSentences('The rate is 3.14 percent today.')).toBe(1);
    expect(countSentences('J. R. R. Tolkien wrote it.')).toBe(1);
    // but real boundaries still split
    expect(countSentences('First sentence. Second sentence.')).toBe(2);
  });
  it('C3 — splitSentences returns the trimmed sentence strings', () => {
    expect(splitSentences('Hello world. Bye now!')).toEqual(['Hello world.', 'Bye now!']);
    expect(splitSentences('   ')).toEqual([]);
  });
  it('#3 — a numbered list is not split into a sentence per ordinal', () => {
    expect(countSentences('1. First 2. Second 3. Third')).toBe(1);
    expect(countSentences('Steps: 1. Prep 2. Cook 3. Serve')).toBe(1);
    // real prose sentences still split on their terminal periods
    expect(countSentences('The plan is ready. We will ship it. Then we celebrate.')).toBe(3);
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
  it('C1 — GOLDEN syllable counts (the heuristic must be exact for these)', () => {
    expect(syllablesInWord('table')).toBe(2);       // consonant + -le
    expect(syllablesInWord('cycle')).toBe(2);
    expect(syllablesInWord('queue')).toBe(1);       // 3-vowel run, not 2
    expect(syllablesInWord('walked')).toBe(1);      // silent -ed
    expect(syllablesInWord('wanted')).toBe(2);      // syllabic -ed (t+ed)
    expect(syllablesInWord('added')).toBe(2);       // syllabic -ed (d+ed)
    expect(syllablesInWord('boxes')).toBe(2);       // syllabic -es after sibilant
    expect(syllablesInWord('makes')).toBe(1);       // silent -es
    expect(syllablesInWord('cat')).toBe(1);
  });
  it('C2 — pure-number tokens count as syllables (per digit), never 0', () => {
    expect(syllablesInWord('123')).toBe(3);
    expect(syllablesInWord('2024')).toBe(4);
    expect(syllablesInWord('7')).toBe(1);
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
  it('GOLDEN — hand-computed Flesch for a known sentence', () => {
    // "The cat sat on the mat." = 6 words, 6 syllables (all monosyllabic),
    // 1 sentence. Flesch = 206.835 − 1.015·(6/1) − 84.6·(6/6) = 116.145 → 100.
    // FK grade = 0.39·6 + 11.8·1 − 15.59 = −1.46 → clamped to 0.
    const r = fleschReadingEase('The cat sat on the mat.');
    expect(r).toMatchObject({ score: 100, words: 6, sentences: 1, grade: 0 });
  });
  it('GOLDEN — reports Flesch–Kincaid grade + reading time', () => {
    const r = fleschReadingEase('word '.repeat(400).trim() + '.'); // 400 words
    expect(r.readingTime).toBe(2); // 400 / 200 wpm
    expect(typeof r.grade).toBe('number');
  });
  it('C2 — a number-heavy line does NOT score spuriously "very easy"', () => {
    // Numbers now carry per-digit syllables, so this is not maximally readable.
    const r = fleschReadingEase('2024 2025 2026 2027 2028 2029.');
    expect(r.score).toBeLessThan(100);
  });
});
