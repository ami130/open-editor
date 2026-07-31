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
  const FULL = { expectH1: true, baseHeadingLevel: 1 };
  const FRAG = { expectH1: false, baseHeadingLevel: 2 };
  it('full-page: flags missing H1, multiple H1, and skipped levels', () => {
    expect(headingWarnings([], FULL).some((w) => w.includes('No headings'))).toBe(true);
    expect(headingWarnings([{ level: 2, text: 'x' }], FULL).some((w) => w.includes('No H1'))).toBe(true);
    expect(headingWarnings([{ level: 1, text: 'a' }, { level: 1, text: 'b' }], FULL).some((w) => w.includes('Multiple H1'))).toBe(true);
    expect(headingWarnings([{ level: 1, text: 'a' }, { level: 4, text: 'b' }], FULL).some((w) => w.includes('skip'))).toBe(true);
  });
  it('full-page: a clean single-H1 outline has no warnings', () => {
    expect(headingWarnings([{ level: 1, text: 'a' }, { level: 2, text: 'b' }], FULL)).toEqual([]);
  });
  it('body-fragment: an H2-rooted outline is clean; an in-body H1 is FLAGGED', () => {
    // starting at H2 is correct in a fragment (page H1 is outside)
    expect(headingWarnings([{ level: 2, text: 'a' }, { level: 3, text: 'b' }], FRAG)).toEqual([]);
    // an H1 inside the body would duplicate the page title
    expect(headingWarnings([{ level: 1, text: 'a' }], FRAG).some((w) => w.includes('Contains an H1'))).toBe(true);
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
  it('I5 — multi-word density counts keyword WORDS, not occurrences (unit match)', () => {
    // "rich text" (2 words) appears 2× in an 8-word doc → 4 keyword-words / 8
    // = 50%, NOT 2/8 = 25%.
    const r = keywordDensity('rich text editor is a rich text editor', 'rich text');
    expect(r.count).toBe(2);
    expect(r.density).toBeCloseTo(50, 0);
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
    // REAL failures (applicable, not N/A) must each carry a corrective hint…
    const realFailures = r.checks.filter((c) => !c.ok && !c.na);
    expect(realFailures.length).toBeGreaterThan(0);
    expect(realFailures.every((c) => typeof c.hint === 'string' && c.hint.length)).toBe(true);
    // …and N/A rows must carry NO hint (nothing to fix). (#1)
    const naRows = r.checks.filter((c) => c.na);
    expect(naRows.length).toBeGreaterThan(0);
    expect(naRows.every((c) => c.hint === '')).toBe(true);
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
  it('C4 — throws a clear error (not a deep TypeError) when no Document is available', () => {
    // simulate a headless call with no doc arg and no global document
    const savedDoc = globalThis.document;
    try {
      globalThis.document = undefined;
      expect(() => analyzeSeo('<p>hi</p>', {})).toThrow(/Document is required/);
    } finally {
      globalThis.document = savedDoc;
    }
  });
  it('edge — whitespace-only, only-images, and CJK docs do not throw', () => {
    expect(() => analyzeSeo('   ', {}, D())).not.toThrow();
    const imgOnly = analyzeSeo('<img src="a"><img src="b" alt="">', {}, D());
    expect(imgOnly.wordCount).toBe(0);
    expect(imgOnly.linkImage.images.missingAlt).toBe(1);
    expect(imgOnly.linkImage.images.decorative).toBe(1);
    const cjk = analyzeSeo('<h1>标题</h1><p>' + '内容'.repeat(200) + '</p>', { keyword: '标题' }, D());
    expect(cjk.wordCount).toBeGreaterThan(0);
    expect(Number.isFinite(cjk.score)).toBe(true);
    expect(cjk.readability.words).toBeGreaterThan(0);
  });
  it('edge — a decorative-only image doc is not penalized for "missing alt"', () => {
    const r = analyzeSeo('<h1>T</h1><p>body</p><img src="a" alt="">', {}, D());
    const imgCheck = r.checks.find((c) => c.label.startsWith('Images'));
    expect(imgCheck.ok).toBe(true); // alt="" is fine, not a failure
  });
  it('score is category-split (seoScore + readabilityScore) and blends SEO-dominant', () => {
    const r = analyzeSeo(rich, { keyword: 'seo' }, D());
    expect(r.seoScore).toBeGreaterThanOrEqual(0);
    expect(r.seoScore).toBeLessThanOrEqual(100);
    expect(r.readabilityScore).toBeGreaterThanOrEqual(0);
    expect(r.readabilityScore).toBeLessThanOrEqual(100);
    // overall lies between the two category scores (weighted blend)
    const lo = Math.min(r.seoScore, r.readabilityScore);
    const hi = Math.max(r.seoScore, r.readabilityScore);
    expect(r.score).toBeGreaterThanOrEqual(lo - 1);
    expect(r.score).toBeLessThanOrEqual(hi + 1);
  });
  it('keyword PLACEMENT now counts toward the SEO score (well-placed keyword lifts it)', () => {
    // Same substantive body; one mentions the keyword in H1 + first paragraph.
    const body = 'word '.repeat(320);
    const without = analyzeSeo(`<h1>Guide</h1><p>${body}</p>`, { keyword: 'widget' }, D());
    const withPlacement = analyzeSeo(`<h1>widget Guide</h1><p>widget ${body} widget</p>`, { keyword: 'widget' }, D());
    // placing the keyword in the H1/first-paragraph raises the SEO subscore
    expect(withPlacement.seoScore).toBeGreaterThan(without.seoScore);
  });
  it('a keyword-stuffed THIN doc is not propped up by readability (scores low)', () => {
    // "seo seo seo seo" is too short to score readability at all (null, n/a),
    // so it cannot prop up the overall score — which stays low on bad SEO.
    const r = analyzeSeo('<p>seo seo seo seo</p>', { keyword: 'seo' }, D());
    expect(r.readabilityScore).toBeNull();  // too little text to assess
    expect(r.score).toBeLessThan(35);       // overall stays low (SEO-driven)
  });
  it('checks for absent content (no images/links) are NOT applicable, not green wins', () => {
    const r = analyzeSeo('<h1>Title Here</h1><p>' + 'word '.repeat(40) + '</p>', {}, D());
    const img = r.checks.find((c) => c.label.startsWith('Images'));
    const lnk = r.checks.find((c) => c.label.startsWith('Links'));
    expect(img.na).toBe(true);
    expect(img.ok).toBe(false);      // not counted as a passed check
    expect(img.scored).toBe(false);  // not counted toward score
    expect(lnk.na).toBe(true);
    expect(img.label).toBe('Images: none');
    // an n/a check is neither in "problems" nor "good"
    const good = r.checks.filter((c) => !c.na && c.ok);
    expect(good.includes(img)).toBe(false);
  });
  it('content-depth checks are n/a below a small word floor (no phantom greens)', () => {
    const r = analyzeSeo('<h1>Hi</h1><p>a b</p>', {}, D());
    const depthLabels = ['Avg sentence length', 'Passive voice', 'Long sentences', 'Transition words'];
    for (const lbl of depthLabels) {
      const c = r.checks.find((x) => x.label.startsWith(lbl));
      expect(c.na).toBe(true);
    }
    // readability itself is n/a for a 2-word fragment
    expect(r.readabilityScore).toBeNull();
  });
  it('#2 — words in tables/lists/adjacent paragraphs are NOT glued together', () => {
    // textContent alone would give "NetSales"/"alphabeta"; block boundaries fix it.
    expect(plainText('<table><tr><td>Net</td><td>Sales</td></tr></table>', D())).toBe('Net Sales');
    expect(plainText('<ul><li>alpha</li><li>beta</li></ul>', D())).toBe('alpha beta');
    expect(plainText('<p>one</p><p>two</p>', D())).toBe('one two');
    // inline formatting still joins (no spurious split inside a word)
    expect(plainText('<p>Hello <strong>world</strong></p>', D())).toBe('Hello world');
    // a table-heavy doc counts its real words (not one glued token)
    const r = analyzeSeo('<h1>R</h1><table><tr><td>quarterly</td><td>revenue</td></tr><tr><td>grew</td><td>fast</td></tr></table>', {}, D());
    expect(r.wordCount).toBe(5); // R + quarterly + revenue + grew + fast
  });
  it('#3 — readability/depth are scored (not N/A) once past the small prose floor', () => {
    // ~12 words with a sentence — above MIN_PROSE_WORDS(10), so NOT n/a anymore.
    const r = analyzeSeo('<h1>T</h1><p>The quick brown fox jumps over the lazy dog every single morning.</p>', {}, D());
    const read = r.checks.find((c) => c.label.startsWith('Readability'));
    expect(read.na).toBe(false);
    expect(r.readabilityScore).not.toBeNull();
    const avg = r.checks.find((c) => c.label.startsWith('Avg sentence length'));
    expect(avg.na).toBe(false);
  });
  it('#3 — a genuinely tiny fragment is still N/A (below the floor)', () => {
    const r = analyzeSeo('<p>hi there</p>', {}, D());
    expect(r.readabilityScore).toBeNull();
    expect(r.checks.find((c) => c.label.startsWith('Readability')).na).toBe(true);
  });
  it('#4 — an ABSENT meta description is guidance (unscored), not a score penalty', () => {
    const r = analyzeSeo('<h1>T</h1><p>' + 'word '.repeat(40) + '</p>', {}, D());
    const metaCheck = r.checks.find((c) => c.label.startsWith('Meta description'));
    expect(metaCheck.ok).toBe(false);
    expect(metaCheck.scored).toBe(false); // does not dock the score
  });
  it('#4 — a SET-but-wrong-length meta IS a scored problem', () => {
    const r = analyzeSeo('<h1>T</h1><p>' + 'word '.repeat(40) + '</p>', { metaDescription: 'too short' }, D());
    const metaCheck = r.checks.find((c) => c.label.startsWith('Meta description'));
    expect(metaCheck.ok).toBe(false);
    expect(metaCheck.scored).toBe(true);
  });
  it('#5 — in FULL-PAGE context, analyzeSeo falls back to the H1 for the title', () => {
    // H1-as-title only makes sense when the editor IS the whole page.
    const r = analyzeSeo('<h1>My Great Guide To Widgets</h1><p>body</p>', { contentContext: 'full-page' }, D());
    expect(r.snippet.title).toBe('My Great Guide To Widgets');
    // in body-fragment (default), the in-body H1 is NOT treated as the page title
    const frag = analyzeSeo('<h1>My Great Guide To Widgets</h1><p>body</p>', {}, D());
    expect(frag.snippet.title).toBe('Untitled document');
    // explicit title still wins in any context
    const r2 = analyzeSeo('<h1>H1 Title</h1><p>body</p>', { title: 'Explicit' }, D());
    expect(r2.snippet.title).toBe('Explicit');
  });
  it('#7 — "keyword in first paragraph" ignores a figure caption', () => {
    const html = '<figure><img src="a"><figcaption>widget photo</figcaption></figure>'
      + '<p>This lead paragraph has no target term.</p>';
    const r = analyzeSeo(html, { keyword: 'widget' }, D());
    // the keyword is only in the caption, so the lead-paragraph check is false
    expect(r.keywordIntel.inFirstParagraph).toBe(false);
  });
  it('images/links WITH content are scored normally (regression: na only when absent)', () => {
    const r = analyzeSeo('<h1>T</h1><p>' + 'word '.repeat(40) + '</p><img src="a"><a href="/x">go somewhere useful</a>', {}, D());
    const img = r.checks.find((c) => c.label.startsWith('Images'));
    const lnk = r.checks.find((c) => c.label.startsWith('Links'));
    expect(img.na).toBe(false);
    expect(img.scored).toBe(true);   // has an image → assessed
    expect(img.ok).toBe(false);      // …and it's missing alt → a real problem
    expect(lnk.na).toBe(false);
    expect(lnk.ok).toBe(true);       // link has anchor text
  });
  it('uses the passed title in the snippet (H1 fallback is the plugin\'s job)', () => {
    const r = analyzeSeo('<h1>H</h1><p>body</p>', { title: 'Passed Title' }, D());
    expect(r.snippet.title).toBe('Passed Title');
  });
});
