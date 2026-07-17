import { describe, it, expect } from 'vitest';
import {
  analyzeSeo, keywordDensity, headings, headingWarnings, metaAssessment, topWords, plainText,
} from '../src/seo-analyze.js';

const D = () => document;

describe('plainText', () => {
  it('strips tags and zero-width chars, collapses NBSP', () => {
    expect(plainText('<p>Hello <strong>world</strong>​</p>', document)).toBe('Hello world');
  });
});

describe('headings + warnings', () => {
  it('collects headings in document order with levels', () => {
    const hs = headings('<h1>A</h1><h2>B</h2><h3>C</h3>', document);
    expect(hs).toEqual([{ level: 1, text: 'A' }, { level: 2, text: 'B' }, { level: 3, text: 'C' }]);
  });
  it('flags missing H1, multiple H1, and skipped levels', () => {
    expect(headingWarnings([])).toContain('No headings — add structure with H1/H2.');
    expect(headingWarnings([{ level: 2, text: 'x' }]).some((w) => w.includes('No H1'))).toBe(true);
    expect(headingWarnings([{ level: 1, text: 'a' }, { level: 1, text: 'b' }]).some((w) => w.includes('Multiple H1'))).toBe(true);
    expect(headingWarnings([{ level: 2, text: 'a' }, { level: 4, text: 'b' }]).some((w) => w.includes('skip'))).toBe(true);
  });
  it('a clean single-H1 outline has no warnings', () => {
    expect(headingWarnings([{ level: 1, text: 'a' }, { level: 2, text: 'b' }])).toEqual([]);
  });
});

describe('keywordDensity', () => {
  it('counts whole-word occurrences and computes percentage', () => {
    const r = keywordDensity('seo is great, seo wins, love seo', 'seo');
    expect(r.count).toBe(3);
    expect(r.total).toBe(7);
    expect(r.density).toBeCloseTo(42.9, 0);
  });
  it('is case-insensitive and word-bounded (no partials)', () => {
    expect(keywordDensity('Cats and category', 'cat').count).toBe(0); // no partials
    expect(keywordDensity('Cat cat CAT', 'cat').count).toBe(3);
  });
  it('handles multi-word phrases and regex-special chars safely', () => {
    expect(keywordDensity('rich text editor is a rich text editor', 'rich text').count).toBe(2);
    expect(() => keywordDensity('a (b) c', 'a (b)')).not.toThrow();
  });
  it('SEO-3 — finds accented + non-Latin keywords (was 0 with ASCII \\b)', () => {
    expect(keywordDensity('the café and another café', 'café').count).toBe(2);
    expect(keywordDensity('Москва это Москва', 'Москва').count).toBe(2);
  });
  it('empty keyword or empty text → zero density, no throw', () => {
    expect(keywordDensity('some text', '').density).toBe(0);
    expect(keywordDensity('', 'x').density).toBe(0);
  });
});

describe('metaAssessment', () => {
  it('flags empty / short / long, passes good length', () => {
    expect(metaAssessment('').status).toBe('warn');
    expect(metaAssessment('too short').status).toBe('warn');
    expect(metaAssessment('x'.repeat(130)).status).toBe('ok');
    expect(metaAssessment('x'.repeat(200)).status).toBe('warn');
  });
});

describe('topWords', () => {
  it('ranks frequent non-stopwords, ignores short + stopwords', () => {
    const t = topWords('editor editor editor content content the the and');
    expect(t[0]).toEqual({ word: 'editor', count: 3 });
    expect(t.find((w) => w.word === 'the')).toBeUndefined();
  });
});

describe('analyzeSeo — integration', () => {
  const rich = '<h1>Guide</h1><h2>Intro</h2>' + '<p>' + 'word '.repeat(320) + 'seo seo</p>';
  it('produces a full report with a 0..100 score', () => {
    const r = analyzeSeo(rich, { keyword: 'seo', metaDescription: 'x'.repeat(130) }, D());
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.wordCount).toBeGreaterThan(300);
    expect(r.headings.length).toBe(2);
    expect(r.keyword.count).toBe(2);
    expect(Array.isArray(r.checks)).toBe(true);
  });
  it('a thin, headless, keyword-stuffed doc scores low with actionable hints', () => {
    const bad = '<p>seo seo seo seo</p>';
    const r = analyzeSeo(bad, { keyword: 'seo' }, D());
    expect(r.score).toBeLessThan(50);
    const failing = r.checks.filter((c) => !c.ok);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.every((c) => typeof c.hint === 'string' && c.hint.length)).toBe(true);
  });
  it('omitting a keyword drops the keyword check (no false failure)', () => {
    const r = analyzeSeo('<h1>T</h1><p>hi</p>', {}, D());
    expect(r.checks.some((c) => c.label.startsWith('Keyword'))).toBe(false);
  });
  it('empty document does not throw and reports zero words', () => {
    const r = analyzeSeo('', {}, D());
    expect(r.wordCount).toBe(0);
    expect(r.readability.label).toBe('No text');
  });
  it('SEO-2 — typing a keyword does NOT lurch the score (stable scored set)', () => {
    const html = '<h1>Guide</h1><p>' + 'word '.repeat(320) + '</p>';
    const noKw = analyzeSeo(html, {}, D()).score;
    const withKw = analyzeSeo(html, { keyword: 'guide' }, D()).score;
    // The score is computed only over the stable CORE checks, so adding a
    // keyword (which appends UNSCORED guidance) leaves the score unchanged.
    expect(withKw).toBe(noKw);
  });
  it('SEO-2 — keyword + advanced checks are present but marked unscored', () => {
    const r = analyzeSeo('<h1>T</h1><p>hi there</p>', { keyword: 'hi' }, D());
    const kwCheck = r.checks.find((c) => c.label.startsWith('Keyword'));
    expect(kwCheck).toBeTruthy();
    expect(kwCheck.scored).toBe(false);
  });
  it('uses the passed title in the snippet (H1 fallback is the plugin\'s job)', () => {
    const r = analyzeSeo('<h1>H</h1><p>body</p>', { title: 'Passed Title' }, D());
    expect(r.snippet.title).toBe('Passed Title');
  });
});
