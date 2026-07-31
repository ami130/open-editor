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
  it('I8 — distinguishes MISSING alt from decorative alt="" (only missing is flagged)', () => {
    const r = linkImageSeo(root('<img src="a" alt="cat"><img src="b"><img src="c" alt="">'));
    expect(r.images.total).toBe(3);
    expect(r.images.missingAlt).toBe(1);    // only <img src="b"> has NO alt attr
    expect(r.images.decorative).toBe(1);    // alt="" is decorative, not a problem
  });
  it('I9 — mailto/tel/#anchor classify as "other", not internal', () => {
    const r = linkImageSeo(root(
      '<a href="mailto:a@b.com">mail</a><a href="tel:+1">call</a><a href="#top">top</a><a href="/page">int</a>'));
    expect(r.links.other).toBe(3);
    expect(r.links.internal).toBe(1);
    expect(r.links.external).toBe(0);
  });
  it('flags generic anchor text and naked-URL anchors', () => {
    const r = linkImageSeo(root(
      '<a href="/a">click here</a><a href="https://x.com">https://x.com</a><a href="/c">Good descriptive text</a>'));
    expect(r.links.generic).toBe(1);   // "click here"
    expect(r.links.naked).toBe(1);     // anchor === href
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
  const capture = (ctx) => {
    const rows = [];
    const add = (group, ok, label, hint, weight = 1, opts = {}) => rows.push({ group, ok, label, hint, weight, na: !!opts.na });
    advancedChecks(add, ctx);
    return rows;
  };
  const baseCtx = (over = {}) => ({
    depth: { avgWordsPerSentence: 15, longSentencePct: 10, passivePct: 5, transitionPct: 30 },
    linkImage: { images: { total: 2, missingAlt: 0, decorative: 0 }, links: { total: 3, internal: 2, external: 1, other: 0, empty: 0, nofollow: 0, generic: 0, naked: 0 } },
    snippet: { titleLength: 45, titleStatus: 'ok' },
    readingApplicable: true,
    hasTitle: true,
    ...over,
  });

  it('emits content-depth rows as readability guidance (weight 0)', () => {
    const rows = capture(baseCtx());
    const depthRow = rows.find((r) => r.label.startsWith('Avg sentence length'));
    expect(depthRow).toBeTruthy();
    expect(depthRow.group).toBe('readability');
    expect(depthRow.weight).toBe(0);
  });

  it('content-depth rows are N/A when readability is not applicable (short/non-English)', () => {
    const rows = capture(baseCtx({ readingApplicable: false }));
    const avg = rows.find((r) => r.label.startsWith('Avg sentence length'));
    expect(avg.na).toBe(true);
    expect(avg.label).toContain('n/a');
  });

  it('drives thresholds to FAILING: long sentences, passive, transitions, alt, empty links, title', () => {
    const rows = capture(baseCtx({
      depth: { avgWordsPerSentence: 30, longSentencePct: 40, passivePct: 25, transitionPct: 5 },
      linkImage: { images: { total: 3, missingAlt: 2, decorative: 0 }, links: { total: 2, internal: 1, external: 0, other: 0, empty: 1, nofollow: 0, generic: 0, naked: 0 } },
      snippet: { titleLength: 20, titleStatus: 'warn' },
      hasTitle: true,
    }));
    const fail = (frag) => { const r = rows.find((x) => x.label.startsWith(frag)); return r && !r.ok && !r.na; };
    expect(fail('Avg sentence length')).toBe(true);
    expect(fail('Long sentences')).toBe(true);
    expect(fail('Passive voice')).toBe(true);
    expect(fail('Transition words')).toBe(true);
    expect(fail('Images')).toBe(true);
    expect(fail('Links')).toBe(true);
    expect(fail('Title')).toBe(true);
  });

  it('an absent title is N/A (not a scored failure)', () => {
    const rows = capture(baseCtx({ snippet: { titleLength: 0, titleStatus: 'warn' }, hasTitle: false }));
    const title = rows.find((r) => r.label.startsWith('Title'));
    expect(title.na).toBe(true);
  });

  it('surfaces generic/naked/nofollow link rows only when present', () => {
    const none = capture(baseCtx());
    expect(none.some((r) => r.label.startsWith('Generic anchor'))).toBe(false);
    const flagged = capture(baseCtx({
      linkImage: { images: { total: 0, missingAlt: 0, decorative: 0 }, links: { total: 3, internal: 3, external: 0, other: 0, empty: 0, nofollow: 1, generic: 1, naked: 1 } },
    }));
    expect(flagged.some((r) => r.label.startsWith('Generic anchor'))).toBe(true);
    expect(flagged.some((r) => r.label.startsWith('Raw URL'))).toBe(true);
    expect(flagged.some((r) => r.label.startsWith('Nofollow'))).toBe(true);
  });
});
