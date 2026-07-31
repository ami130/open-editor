/**
 * seo-config.js — the single, documented, validated option/ruleset schema for
 * the SEO analyzer (mirrors export-pdf's normalizeOptions pattern). Every
 * threshold and structural assumption lives here so a third-party host can
 * configure the analyzer for its context instead of fighting hard-coded
 * article/full-page/English defaults.
 *
 * Pure + dependency-free so it can be imported by both the pure analyzer and
 * the plugin without pulling in DOM code.
 */

// Languages whose readability heuristics (Flesch constants, syllable rules,
// passive-voice + transition word lists) are English-calibrated. For any other
// language we DEGRADE GRACEFULLY (skip those checks with a note) rather than
// showing a confident but meaningless English-tuned score.
const SUPPORTED_READABILITY_LANGS = new Set(['en']);

/** Default analysis ruleset — every threshold, overridable per host. */
export const DEFAULT_RULESET = {
  minWords: 300,            // "substantive content" floor (article default)
  densityMin: 0.5,          // healthy keyword density band (%)
  densityMax: 2.5,
  metaMin: 120,             // meta description length band (chars)
  metaMax: 158,
  titleMin: 30,             // SERP title length band (chars, ~pixel proxy)
  titleMax: 60,
  avgSentenceMax: 20,       // readability: avg words/sentence
  longSentenceWords: 25,    // a "long" sentence is > this many words
  longSentencePctMax: 25,   // ≤ this % of sentences may be long
  passivePctMax: 15,        // ≤ this % of sentences passive
  transitionPctMin: 20,     // ≥ this % of sentences use a transition
  fleschPassing: 60,        // Flesch Reading Ease pass threshold ("Plain English")
  minProseWords: 10,        // below this, readability/depth checks are N/A
  readingWpm: 200,          // words-per-minute for reading time
};

const CONTEXTS = new Set(['body-fragment', 'full-page']);

/**
 * Normalize + default host options into a single frozen config object.
 *
 * @param {object} [opts]
 * @param {string} [opts.keyword]           focus keyphrase
 * @param {string} [opts.metaDescription]   page meta description (page-level)
 * @param {string} [opts.title]             real page <title> (page-level)
 * @param {string} [opts.url]               real page URL (for the SERP preview)
 * @param {string} [opts.siteUrl]           site ORIGIN, so absolute self-links
 *                                          classify as internal, not external
 * @param {'body-fragment'|'full-page'} [opts.contentContext]
 *        'body-fragment' (DEFAULT): the editor holds BODY content under a host-
 *        owned page title/H1 — so an in-body H1 is NOT required (and is flagged
 *        if present, since it would duplicate the page H1); the heading outline
 *        may legitimately start at H2; the word-count floor is relaxed.
 *        'full-page': the editor IS the whole document — require exactly one H1,
 *        outline starts at H1, article-length word floor applies.
 * @param {boolean} [opts.expectH1]  fine override of the context's H1 rule.
 * @param {string}  [opts.lang]      BCP-47-ish language (e.g. 'en', 'de', 'ja').
 *        Readability/passive/transition checks run only for English; other
 *        languages degrade to N/A with a note (never a wrong score).
 * @param {object}  [opts.ruleset]   partial threshold overrides (see DEFAULT_RULESET).
 * @param {Function} [opts.customChecks]  a host extension hook:
 *        `(facts) => Array<{group,ok,label,hint?,weight?,na?}>`. Called after
 *        the built-in checks with the raw analysis facts (wordCount, headings,
 *        keyword, readability, depth, linkImage, keywordIntel, text, cfg); the
 *        returned rows are appended and scored like any built-in check. Lets a
 *        host add domain-specific checks without forking. Errors are swallowed
 *        so a bad hook can't crash the analysis.
 * @returns {object} a normalized, frozen config
 */
export function normalizeOptions(opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const contentContext = CONTEXTS.has(o.contentContext) ? o.contentContext : 'body-fragment';
  const fullPage = contentContext === 'full-page';

  // Language: normalize "en-US" → "en"; default 'en'. readabilitySupported
  // decides whether the English-tuned metrics run or degrade to N/A.
  const lang = (typeof o.lang === 'string' && o.lang.trim())
    ? o.lang.trim().toLowerCase().split(/[-_]/)[0]
    : 'en';
  const readabilitySupported = SUPPORTED_READABILITY_LANGS.has(lang);

  // expectH1: explicit override wins; else derived from context (full-page
  // requires an H1, body-fragment does not).
  const expectH1 = typeof o.expectH1 === 'boolean' ? o.expectH1 : fullPage;

  // baseHeadingLevel: the outline's expected top level. Full-page docs start at
  // H1; body fragments legitimately start at H2 (the page H1 is outside).
  const baseHeadingLevel = fullPage ? 1 : 2;

  const ruleset = { ...DEFAULT_RULESET, ...(o.ruleset && typeof o.ruleset === 'object' ? o.ruleset : {}) };
  // In body-fragment context, relax the article word floor unless the host set
  // one explicitly (a product blurb / email body isn't 300 words).
  if (!fullPage && !(o.ruleset && typeof o.ruleset.minWords === 'number')) {
    ruleset.minWords = 50;
  }

  const str = (v) => (v != null ? String(v) : '');
  return Object.freeze({
    keyword: str(o.keyword).trim(),
    metaDescription: str(o.metaDescription),
    title: str(o.title).trim(),
    url: str(o.url).trim(),
    siteUrl: str(o.siteUrl).trim(),
    contentContext,
    expectH1,
    baseHeadingLevel,
    lang,
    readabilitySupported,
    ruleset: Object.freeze(ruleset),
    customChecks: typeof o.customChecks === 'function' ? o.customChecks : null,
  });
}
