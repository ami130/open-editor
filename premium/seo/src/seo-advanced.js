/**
 * seo-advanced.js — the "best of best" analysis layer on top of seo-analyze.js.
 * Pure functions, no DOM mutation; all take a parsed root element (or text) and
 * return structured findings. Grouped so seo-analyze.js can compose them into
 * the report + checklist.
 *
 *   contentDepth(text)      — sentence/paragraph length, passive voice, transitions
 *   linkImageSeo(root)      — internal/external links, empty links, missing alt
 *   keywordIntelligence(...)— keyword in H1/first-para/subheadings/meta + n-grams
 */
import { words, countKeyword, splitSentences } from './readability.js';

// Minimum words for prose-level metrics (readability + content depth) to be
// meaningful. Below this — or with no complete sentence — those checks are N/A
// rather than reporting a noisy score on a fragment. One shared floor (not two
// thresholds) keeps readability and depth in lock-step. Defined here so both
// seo-analyze and seo-checks can import it without a circular dependency.
export const MIN_PROSE_WORDS = 10;

// ── Content depth ──────────────────────────────────────────────────────────

const TRANSITIONS = new Set(['however', 'therefore', 'moreover', 'furthermore', 'consequently', 'meanwhile', 'nevertheless', 'additionally', 'similarly', 'accordingly', 'subsequently', 'thus', 'hence', 'besides', 'finally', 'instead', 'likewise', 'namely', 'overall', 'ultimately', 'because', 'although', 'since', 'while', 'whereas']);
// Passive voice heuristic: a "to be" form + a past participle. Heuristic —
// flagged as an ESTIMATE (like every JS SEO tool). Tightened to cut the most
// common false positives: predicate ADJECTIVES after a copula ("is excited",
// "are committed") that end in -ed/-en but aren't passives.
const BE = '(?:is|are|was|were|been|being|be|get|got)';
// Very common copula + -ed/-en ADJECTIVES that are NOT passive voice. Excluding
// these removes the bulk of false alarms on ordinary active prose.
const NOT_PASSIVE = new Set([
  'excited', 'interested', 'committed', 'tired', 'talented', 'gifted', 'skilled',
  'experienced', 'dedicated', 'motivated', 'related', 'limited', 'detailed',
  'advanced', 'complicated', 'sophisticated', 'concerned', 'pleased', 'delighted',
  'surprised', 'disappointed', 'worried', 'scared', 'bored', 'confused', 'engaged',
  'located', 'based', 'aged', 'focused', 'thrilled', 'finished', 'used',
  // common irregular participles used as copula complements (state, not passive)
  'done', 'set', 'gone', 'shown', 'grown', 'run',
]);
// Common IRREGULAR past participles that don't end in -ed/-en, so the regular
// pattern misses them ("was written", "is made", "were built"). Detected as a
// second passive pattern. (I10)
const IRREGULAR_PARTICIPLES = ['written', 'made', 'built', 'sold', 'kept', 'held', 'told', 'sent', 'brought', 'bought', 'caught', 'taught', 'thought', 'found', 'left', 'lost', 'meant', 'paid', 'read', 'set', 'put', 'cut', 'led', 'run', 'done', 'gone', 'seen', 'shown', 'drawn', 'grown', 'thrown', 'flown', 'begun'];
// Participle: -ed/-en on a word of at least 4 letters (drops "red", "fed", "den").
const PASSIVE_RE = new RegExp(`\\b${BE}\\b\\s+(?:\\w+ly\\s+)?(\\w{4,}(?:ed|en))\\b`, 'gi');
const PASSIVE_IRREGULAR_RE = new RegExp(`\\b${BE}\\b\\s+(?:\\w+ly\\s+)?(${IRREGULAR_PARTICIPLES.join('|')})\\b`, 'gi');

/**
 * Split text into sentences. Delegates to readability.splitSentences so
 * content-depth and the Flesch score ALWAYS see the same sentence count — the
 * two used to be different regexes that disagreed on abbreviations/decimals
 * despite a comment claiming they matched. (C3)
 */
export function sentences(text) {
  return splitSentences(typeof text === 'string' ? text : '');
}

export function contentDepth(text) {
  const sents = sentences(text);
  const wc = words(text).length;
  const longSentences = sents.filter((s) => words(s).length > 25);
  const transitionSents = sents.filter((s) =>
    s.toLowerCase().split(/\W+/).some((w) => TRANSITIONS.has(w)));
  // Count passive matches, excluding common copula-adjective false positives,
  // plus irregular participles the -ed/-en pattern can't catch.
  let passiveCount = 0;
  let m;
  PASSIVE_RE.lastIndex = 0;
  while ((m = PASSIVE_RE.exec(text)) !== null) {
    if (!NOT_PASSIVE.has(m[1].toLowerCase())) passiveCount++;
  }
  PASSIVE_IRREGULAR_RE.lastIndex = 0;
  while ((m = PASSIVE_IRREGULAR_RE.exec(text)) !== null) {
    // Some irregular participles are commonly copula complements, not passives
    // ("is done", "we are set", "is gone") — exclude them like the -ed set.
    if (!NOT_PASSIVE.has(m[1].toLowerCase())) passiveCount++;
  }
  return {
    wordCount: wc,
    sentenceCount: sents.length,
    avgWordsPerSentence: sents.length ? Math.round((wc / sents.length) * 10) / 10 : 0,
    longSentenceCount: longSentences.length,
    longSentencePct: sents.length ? Math.round((longSentences.length / sents.length) * 100) : 0,
    transitionPct: sents.length ? Math.round((transitionSents.length / sents.length) * 100) : 0,
    passiveCount,
    passivePct: sents.length ? Math.round((passiveCount / sents.length) * 100) : 0,
  };
}

// ── Link & image SEO ────────────────────────────────────────────────────────

// Generic anchor phrases that carry no SEO/accessibility value.
const GENERIC_ANCHORS = new Set(['click here', 'here', 'read more', 'more', 'link', 'this', 'this link', 'learn more', 'click', 'download', 'go', 'see more']);

/**
 * Classify an href: 'external' | 'internal' | 'other' (mailto/tel/anchor).
 * When `siteOrigin` is known, an ABSOLUTE URL to that same origin counts as
 * INTERNAL (a CMS routinely emits absolute self-links) — without it we can only
 * treat relative hrefs as internal and all absolute URLs as external. (#5)
 */
function linkKind(href, siteOrigin) {
  const h = String(href || '').trim();
  if (/^(mailto:|tel:|sms:)/i.test(h)) return 'other';
  if (/^#/.test(h)) return 'other';                       // same-page anchor
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(h) || /^\/\//.test(h);
  if (isAbsolute) {
    if (siteOrigin) {
      try {
        // Resolve protocol-relative against https for origin comparison.
        const u = new URL(h.startsWith('//') ? `https:${h}` : h);
        if (u.origin === siteOrigin) return 'internal';
      } catch { /* unparseable → fall through to external */ }
    }
    return 'external';
  }
  return 'internal';                                      // /path, ./x, ?q, foo.html
}

/** Extract the origin (scheme://host) from a configured siteUrl, or ''. */
function originOf(siteUrl) {
  const s = String(siteUrl || '').trim();
  if (!s) return '';
  try { return new URL(s.includes('://') ? s : `https://${s}`).origin; } catch { return ''; }
}

export function linkImageSeo(root, siteUrl) {
  const siteOrigin = originOf(siteUrl);
  const anchors = [...root.querySelectorAll('a[href]')]
    .filter((a) => !a.classList.contains('oe-bookmark')); // skip bookmark anchors
  const links = { internal: 0, external: 0, other: 0, empty: 0, nofollow: 0, generic: 0, naked: 0, total: anchors.length };
  for (const a of anchors) {
    const href = (a.getAttribute('href') || '').trim();
    const kind = linkKind(href, siteOrigin);
    links[kind]++;
    const anchorText = (a.textContent || '').trim();
    if (!anchorText) links.empty++;
    // Generic anchor text ("click here") — poor for SEO + accessibility.
    else if (GENERIC_ANCHORS.has(anchorText.toLowerCase())) links.generic++;
    // Naked URL as its own anchor text (anchor === href) reads poorly.
    else if (anchorText.toLowerCase() === href.toLowerCase()) links.naked++;
    if ((a.getAttribute('rel') || '').includes('nofollow')) links.nofollow++;
  }
  const imgs = [...root.querySelectorAll('img')];
  // Distinguish a MISSING alt attribute (bad — no text alternative) from an
  // explicit empty alt="" (valid: marks a decorative image, must NOT be
  // flagged). Previously both counted as "missing". (I8)
  const images = {
    total: imgs.length,
    missingAlt: imgs.filter((i) => i.getAttribute('alt') === null).length,
    decorative: imgs.filter((i) => i.getAttribute('alt') === '').length,
  };
  return { links, images };
}

// ── Keyword intelligence ─────────────────────────────────────────────────────

function firstParagraphText(root) {
  // The LEAD paragraph — the first <p> that isn't a figure/table caption or
  // otherwise embedded chrome. Falls back to the first block-level text if
  // there's no <p> at all (e.g. content authored as <div>s), so "keyword in
  // first paragraph" measures the real opening text, not a stray caption.
  const ps = [...root.querySelectorAll('p')];
  const lead = ps.find((p) => !p.closest('figure,figcaption,table,blockquote'));
  if (lead) return (lead.textContent || '').toLowerCase();
  if (ps[0]) return (ps[0].textContent || '').toLowerCase();
  const firstBlock = root.querySelector('div,section,article,li');
  return firstBlock ? (firstBlock.textContent || '').toLowerCase() : '';
}

function hasKeyword(text, kw) {
  if (!kw) return false;
  // Unicode-aware whole-word match (matches keywordDensity; fixes accented/
  // non-Latin keywords reporting "not found").
  return countKeyword(text, kw) > 0;
}

// The single shared English stopword set (was duplicated in seo-analyze.js —
// they drifted). Used to filter related-phrase bigrams AND top-word suggestions.
export const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'his', 'has', 'had', 'him', 'she', 'its', 'who', 'why', 'how', 'get', 'got', 'let', 'via', 'per', 'off', 'now', 'new', 'use', 'may', 'few', 'own', 'too', 'very', 'just', 'some', 'into', 'over', 'such', 'that', 'this', 'with', 'from', 'they', 'have', 'were', 'will', 'your', 'their', 'what', 'when', 'been', 'them', 'than', 'then', 'also', 'more', 'most', 'each', 'only', 'like', 'onto', 'upon', 'a', 'an', 'is', 'to', 'of', 'in', 'on', 'it', 'as', 'at', 'be', 'or', 'by', 'we', 'do', 'if', 'so', 'up', 'no']);

/** n-gram related-term suggestions (2-word phrases, most frequent). */
export function relatedPhrases(text, n = 5) {
  const toks = words(text).filter((w) => w.length > 2);
  const counts = new Map();
  for (let i = 0; i < toks.length - 1; i++) {
    // Skip bigrams where BOTH tokens are stopwords ("and the", "of the").
    if (STOPWORDS.has(toks[i]) && STOPWORDS.has(toks[i + 1])) continue;
    const bigram = `${toks[i]} ${toks[i + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([phrase, count]) => ({ phrase, count }));
}

export function keywordIntelligence(root, text, keyword, metaDescription, title) {
  const kw = String(keyword || '').trim().toLowerCase();
  const h1 = root.querySelector('h1');
  const subs = [...root.querySelectorAll('h2,h3')];
  // Title source: explicit title, else the first H1's text.
  const titleText = String(title || (h1 && h1.textContent) || '');
  const inSub = kw ? subs.some((h) => hasKeyword(h.textContent || '', kw)) : null;
  return {
    keyword: kw,
    inTitle: kw ? hasKeyword(titleText, kw) : null,
    inH1: kw ? hasKeyword((h1 && h1.textContent) || '', kw) : null,
    inFirstParagraph: kw ? hasKeyword(firstParagraphText(root), kw) : null,
    inSubheadings: inSub,
    inSubheading: inSub, // alias (both names used by callers)
    inMeta: kw ? hasKeyword(metaDescription || '', kw) : null,
    related: relatedPhrases(text),
  };
}

/** Back-compat: true if an href points outside the current document. */
function isExternal(href) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || /^\/\//.test(href);
}

export { isExternal, linkKind, TRANSITIONS };
