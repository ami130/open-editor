/**
 * seo-config.test.js — the embedded-context configuration surface: content
 * context (H1/title assumptions), i18n degradation, siteUrl link classification,
 * keyword N/A on empty, ruleset overrides, custom-check hook, and the pure
 * ./analyze subpath. These are the behaviors that make the package correct as
 * a third-party npm dependency.
 */
import { describe, it, expect } from 'vitest';
import { analyzeSeo, normalizeOptions, DEFAULT_RULESET } from '../src/analyze.js';

const D = () => document;
const long = (n = 40) => '<p>' + 'The editor helps you write clean content quickly. '.repeat(n) + '</p>';

describe('normalizeOptions', () => {
  it('defaults to body-fragment, English, derived expectH1=false', () => {
    const o = normalizeOptions();
    expect(o.contentContext).toBe('body-fragment');
    expect(o.expectH1).toBe(false);
    expect(o.baseHeadingLevel).toBe(2);
    expect(o.lang).toBe('en');
    expect(o.readabilitySupported).toBe(true);
  });
  it('full-page flips the H1/heading-root/word-floor assumptions', () => {
    const o = normalizeOptions({ contentContext: 'full-page' });
    expect(o.expectH1).toBe(true);
    expect(o.baseHeadingLevel).toBe(1);
    expect(o.ruleset.minWords).toBe(300);
  });
  it('body-fragment relaxes the word floor unless overridden', () => {
    expect(normalizeOptions({}).ruleset.minWords).toBe(50);
    expect(normalizeOptions({ ruleset: { minWords: 120 } }).ruleset.minWords).toBe(120);
  });
  it('normalizes lang (en-US → en) and marks non-English readability unsupported', () => {
    expect(normalizeOptions({ lang: 'en-US' }).lang).toBe('en');
    expect(normalizeOptions({ lang: 'de' }).readabilitySupported).toBe(false);
    expect(normalizeOptions({ lang: 'ja-JP' }).readabilitySupported).toBe(false);
  });
  it('ruleset overrides merge over defaults', () => {
    const o = normalizeOptions({ ruleset: { densityMax: 4 } });
    expect(o.ruleset.densityMax).toBe(4);
    expect(o.ruleset.densityMin).toBe(DEFAULT_RULESET.densityMin);
  });
});

describe('contentContext — H1 assumptions', () => {
  it('body-fragment (default): H1 is NOT a required scored check', () => {
    const r = analyzeSeo('<h2>Intro</h2>' + long(), {}, D());
    expect(r.checks.some((c) => c.label === 'Has an H1 heading')).toBe(false);
  });
  it('body-fragment: an in-body H1 is flagged as a conflict', () => {
    const r = analyzeSeo('<h1>Body H1</h1>' + long(), {}, D());
    expect(r.headingWarnings.some((w) => w.includes('Contains an H1'))).toBe(true);
  });
  it('body-fragment: an H2-rooted outline is clean (no false skip/no-H1 warnings)', () => {
    const r = analyzeSeo('<h2>A</h2><h3>B</h3>' + long(), {}, D());
    expect(r.headingWarnings).toEqual([]);
  });
  it('full-page: H1 is a required scored check and its absence warns', () => {
    const r = analyzeSeo('<h2>NoH1</h2>' + long(), { contentContext: 'full-page' }, D());
    expect(r.checks.some((c) => c.label === 'Has an H1 heading')).toBe(true);
    expect(r.headingWarnings.some((w) => w.includes('No H1'))).toBe(true);
  });
});

describe('i18n — non-English degrades gracefully (never wrong scores)', () => {
  it('lang=de marks readability N/A with a language note and null score', () => {
    const r = analyzeSeo('<h2>T</h2>' + long(), { lang: 'de' }, D());
    const rd = r.checks.find((c) => c.label.startsWith('Readability'));
    expect(rd.na).toBe(true);
    expect(rd.label).toContain('de');
    expect(r.readabilityScore).toBeNull();
    // content-depth rows also N/A for non-English
    expect(r.checks.find((c) => c.label.startsWith('Passive voice')).na).toBe(true);
  });
  it('lang=en (default) scores readability normally', () => {
    const r = analyzeSeo('<h2>T</h2>' + long(), {}, D());
    expect(r.readabilityScore).not.toBeNull();
  });
  it('report echoes context + lang', () => {
    const r = analyzeSeo('<p>hi</p>', { lang: 'fr', contentContext: 'full-page' }, D());
    expect(r.context).toBe('full-page');
    expect(r.lang).toBe('fr');
    expect(r.version).toBe(1);
  });
});

describe('CJK keyword matching (#1)', () => {
  it('finds a CJK keyword that the word-boundary lookarounds used to zero out', () => {
    const r = analyzeSeo('<h2>标题</h2><p>' + '内容内容内容 '.repeat(20) + '</p>', { keyword: '内容' }, D());
    expect(r.keyword.count).toBeGreaterThan(0);
  });
  it('still rejects partial Latin matches (cat ≠ category)', () => {
    const r = analyzeSeo('<p>' + 'category '.repeat(60) + '</p>', { keyword: 'cat' }, D());
    expect(r.keyword.count).toBe(0);
  });
});

describe('siteUrl link classification (#5)', () => {
  it('absolute self-links count as internal when siteUrl is given', () => {
    const html = '<p>' + long() + '</p><a href="https://mysite.com/a">x</a><a href="https://other.com/b">y</a>';
    const r = analyzeSeo(html, { siteUrl: 'https://mysite.com' }, D());
    expect(r.linkImage.links.internal).toBe(1);
    expect(r.linkImage.links.external).toBe(1);
  });
  it('without siteUrl, all absolute links are external', () => {
    const html = '<p>x</p><a href="https://mysite.com/a">x</a>';
    const r = analyzeSeo(html, {}, D());
    expect(r.linkImage.links.external).toBe(1);
    expect(r.linkImage.links.internal).toBe(0);
  });
});

describe('keyword checks N/A on empty (#4)', () => {
  it('typing a keyword on a blank doc yields N/A keyword rows, not red failures', () => {
    const r = analyzeSeo('<p></p>', { keyword: 'widget' }, D());
    const kwRows = r.checks.filter((c) => c.label.toLowerCase().includes('keyword'));
    expect(kwRows.length).toBeGreaterThan(0);
    expect(kwRows.every((c) => c.na)).toBe(true);
  });
});

describe('customChecks hook (#P2)', () => {
  it('appends host checks that are scored like built-ins', () => {
    const r = analyzeSeo('<h2>T</h2>' + long(), {
      customChecks: (facts) => [
        { group: 'seo', ok: facts.wordCount > 5, label: 'Custom: has content', weight: 1 },
        { group: 'seo', ok: false, label: 'Custom: needs a CTA', hint: 'Add a call to action.', weight: 1 },
      ],
    }, D());
    expect(r.checks.some((c) => c.label === 'Custom: has content' && c.ok)).toBe(true);
    const cta = r.checks.find((c) => c.label === 'Custom: needs a CTA');
    expect(cta.ok).toBe(false);
    expect(cta.hint).toBe('Add a call to action.');
  });
  it('a throwing hook is ignored (never breaks analysis)', () => {
    const r = analyzeSeo('<p>' + long() + '</p>', { customChecks: () => { throw new Error('boom'); } }, D());
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('ruleset overrides change thresholds', () => {
  it('a stricter minWords makes a mid-length doc fail word count', () => {
    const html = '<h2>T</h2><p>' + 'word '.repeat(80) + '</p>';
    const lenient = analyzeSeo(html, { ruleset: { minWords: 50 } }, D());
    const strict = analyzeSeo(html, { ruleset: { minWords: 500 } }, D());
    const wc = (r) => r.checks.find((c) => c.label.startsWith('Word count'));
    expect(wc(lenient).ok).toBe(true);
    expect(wc(strict).ok).toBe(false);
  });
});
