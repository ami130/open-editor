import { describe, it, expect } from 'vitest';
import {
  contentDepth, sentences, linkImageSeo, keywordIntelligence, relatedPhrases, isExternal,
} from '../src/seo-advanced.js';
import { snippetPreview, advancedChecks } from '../src/seo-checks.js';

const root = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('contentDepth', () => {
  it('counts sentences and average length', () => {
    const d = contentDepth('I run fast. You walk slowly today.');
    expect(d.sentenceCount).toBe(2);
    expect(d.avgWordsPerSentence).toBeGreaterThan(0);
  });
  it('flags long sentences (>25 words)', () => {
    const long = Array(30).fill('word').join(' ') + '.';
    const d = contentDepth(long + ' Short one.');
    expect(d.longSentenceCount).toBe(1);
    expect(d.longSentencePct).toBe(50);
  });
  it('detects transition words', () => {
    expect(contentDepth('However, this works. Therefore we win.').transitionPct).toBe(100);
    expect(contentDepth('This works. We win.').transitionPct).toBe(0);
  });
  it('estimates passive voice on regular participles', () => {
    // Regular -ed/-en participles are detected.
    expect(contentDepth('The report was completed by the team.').passiveCount).toBeGreaterThan(0);
    expect(contentDepth('The book was written last year.').passiveCount).toBeGreaterThan(0);
    // Active voice is not flagged.
    expect(contentDepth('John throws the ball.').passiveCount).toBe(0);
  });

  it('does NOT flag common copula + adjective as passive (false-positive fix)', () => {
    // These read as passive to a naive regex but are active predicate adjectives.
    for (const s of [
      'We are excited to announce this.',
      'The team is committed to quality.',
      'I was tired yesterday.',
      'She is talented and skilled.',
    ]) {
      expect(contentDepth(s).passiveCount, s).toBe(0);
    }
  });
});

describe('sentences', () => {
  it('splits on terminal punctuation', () => {
    expect(sentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });
});

describe('isExternal', () => {
  it('distinguishes external URLs from internal refs', () => {
    expect(isExternal('https://x.com')).toBe(true);
    expect(isExternal('//cdn.x.com')).toBe(true);
    expect(isExternal('/about')).toBe(false);
    expect(isExternal('#section')).toBe(false);
  });
});

describe('linkImageSeo', () => {
  it('counts internal/external/empty/nofollow links, skips bookmark anchors', () => {
    const r = linkImageSeo(root(
      '<a href="https://x.com">ext</a>'
      + '<a href="/in">int</a>'
      + '<a href="/empty"></a>'
      + '<a href="https://y.com" rel="nofollow">nf</a>'
      + '<a class="oe-bookmark" id="b"></a>'));
    expect(r.links.total).toBe(4); // bookmark excluded
    expect(r.links.external).toBe(2);
    expect(r.links.internal).toBe(2);
    expect(r.links.empty).toBe(1);
    expect(r.links.nofollow).toBe(1);
  });
  it('counts images missing alt text', () => {
    const r = linkImageSeo(root('<img src="a" alt="cat"><img src="b"><img src="c" alt="">'));
    expect(r.images.total).toBe(3);
    expect(r.images.missingAlt).toBe(2);
  });
});

describe('keywordIntelligence', () => {
  const html = '<h1>Best widget picks</h1><h2>Widget guide</h2><p>Our widget is great.</p>';
  it('detects keyword (whole-word) in H1, first paragraph, subheadings, meta', () => {
    const k = keywordIntelligence(root(html), 'text', 'widget', 'buy a widget cheap');
    expect(k.inH1).toBe(true);            // "widget" whole-word in H1
    expect(k.inFirstParagraph).toBe(true);
    expect(k.inSubheadings).toBe(true);   // "Widget guide" (case-insensitive)
    expect(k.inMeta).toBe(true);
  });
  it('whole-word matching: plural "widgets" does NOT satisfy keyword "widget"', () => {
    const k = keywordIntelligence(root('<h1>Widgets</h1><p>widgets</p>'), 'text', 'widget', '');
    expect(k.inH1).toBe(false);
    expect(k.inFirstParagraph).toBe(false);
  });
  it('SEO-3 — accented/non-Latin keywords are found (Unicode boundaries)', () => {
    const k = keywordIntelligence(root('<h1>Le café</h1><p>Notre café est bon</p>'), 'text', 'café', 'un café');
    expect(k.inH1).toBe(true);
    expect(k.inFirstParagraph).toBe(true);
    expect(k.inMeta).toBe(true);
  });
  it('returns null flags when no keyword given', () => {
    const k = keywordIntelligence(root(html), 'text', '', '');
    expect(k.inH1).toBe(null);
  });
});

describe('relatedPhrases', () => {
  it('surfaces repeated content bigrams', () => {
    const r = relatedPhrases('rich text editor and rich text tools with rich text power');
    expect(r.find((p) => p.phrase === 'rich text')).toBeTruthy();
  });
  it('SEO-7 — excludes all-stopword bigrams like "and the"', () => {
    // "and the" recurs 3x (would top the list) but is all-stopword → excluded;
    // the real content bigram "text editor" recurs and should surface.
    const r = relatedPhrases('text editor and the tool, text editor and the app, text editor and the site');
    expect(r.find((p) => p.phrase === 'and the')).toBeUndefined();
    expect(r.find((p) => p.phrase === 'text editor')).toBeDefined();
  });
});

describe('snippetPreview', () => {
  it('builds a preview and assesses title length', () => {
    expect(snippetPreview({ title: 'x'.repeat(45), metaDescription: 'd', url: 'u' }).titleStatus).toBe('ok');
    expect(snippetPreview({ title: '', metaDescription: '' }).titleStatus).toBe('warn');
    expect(snippetPreview({ title: 'x'.repeat(80) }).titleStatus).toBe('warn');
    expect(snippetPreview({ title: 'short' }).titleStatus).toBe('warn'); // <30
  });
  it('falls back to placeholders for empty fields', () => {
    const s = snippetPreview({});
    expect(s.title).toBe('Untitled document');
    expect(s.description).toContain('No meta description');
  });
});

describe('advancedChecks', () => {
  it('pushes rows and only includes keyword rows when hasKeyword', () => {
    const rows = [];
    const pass = (ok, label, hint) => rows.push({ ok, label, hint });
    const metrics = {
      depth: { avgWordsPerSentence: 15, longSentencePct: 10, passivePct: 5, transitionPct: 30 },
      linkImage: { images: { total: 2, missingAlt: 0 }, links: { total: 3, internal: 2, external: 1, empty: 0 } },
      keywordIntel: { inH1: true, inFirstParagraph: true, inSubheadings: true, inMeta: true },
      snippet: { titleLength: 45, titleStatus: 'ok' },
      hasKeyword: true,
    };
    advancedChecks(pass, metrics);
    expect(rows.some((r) => r.label.includes('H1'))).toBe(true);
    // Without a keyword, keyword rows are omitted.
    const rows2 = [];
    advancedChecks((ok, label) => rows2.push({ label }), { ...metrics, hasKeyword: false });
    expect(rows2.some((r) => r.label.includes('H1'))).toBe(false);
  });
});
