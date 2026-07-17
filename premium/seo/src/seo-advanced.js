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
import { words, countKeyword } from './readability.js';

// ── Content depth ──────────────────────────────────────────────────────────

const TRANSITIONS = new Set(['however', 'therefore', 'moreover', 'furthermore', 'consequently', 'meanwhile', 'nevertheless', 'additionally', 'similarly', 'accordingly', 'subsequently', 'thus', 'hence', 'besides', 'finally', 'instead', 'likewise', 'namely', 'overall', 'ultimately', 'because', 'although', 'since', 'while', 'whereas']);
// Passive voice heuristic: a "to be" form + a past participle. Heuristic —
// flagged as an ESTIMATE (like every JS SEO tool). Tightened to cut the most
// common false positives: predicate ADJECTIVES after a copula ("is excited",
// "are committed") that end in -ed/-en but aren't passives.
const BE = '(?:is|are|was|were|been|being|get|got)';
// Very common copula + -ed/-en ADJECTIVES that are NOT passive voice. Excluding
// these removes the bulk of false alarms on ordinary active prose.
const NOT_PASSIVE = new Set([
  'excited', 'interested', 'committed', 'tired', 'talented', 'gifted', 'skilled',
  'experienced', 'dedicated', 'motivated', 'related', 'limited', 'detailed',
  'advanced', 'complicated', 'sophisticated', 'concerned', 'pleased', 'delighted',
  'surprised', 'disappointed', 'worried', 'scared', 'bored', 'confused', 'engaged',
  'located', 'based', 'known', 'given', 'broken', 'open', 'hidden', 'chosen',
]);
// Participle: -ed/-en on a word of at least 4 letters (drops "red", "fed", "den").
const PASSIVE_RE = new RegExp(`\\b${BE}\\b\\s+(?:\\w+ly\\s+)?(\\w{4,}(?:ed|en))\\b`, 'gi');

/** Split text into sentences (same terminal-punctuation rule as readability). */
export function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function contentDepth(text) {
  const sents = sentences(text);
  const wc = words(text).length;
  const longSentences = sents.filter((s) => words(s).length > 25);
  const transitionSents = sents.filter((s) =>
    s.toLowerCase().split(/\W+/).some((w) => TRANSITIONS.has(w)));
  // Count passive matches, excluding common copula-adjective false positives.
  let passiveCount = 0;
  let m;
  PASSIVE_RE.lastIndex = 0;
  while ((m = PASSIVE_RE.exec(text)) !== null) {
    if (!NOT_PASSIVE.has(m[1].toLowerCase())) passiveCount++;
  }
  return {
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

/** True if an href points outside the current document. */
function isExternal(href) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || /^\/\//.test(href);
}

export function linkImageSeo(root) {
  const anchors = [...root.querySelectorAll('a[href]')]
    .filter((a) => !a.classList.contains('oe-bookmark')); // skip bookmark anchors
  const links = { internal: 0, external: 0, empty: 0, nofollow: 0, total: anchors.length };
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (isExternal(href)) links.external++; else links.internal++;
    if (!(a.textContent || '').trim()) links.empty++;
    if ((a.getAttribute('rel') || '').includes('nofollow')) links.nofollow++;
  }
  const imgs = [...root.querySelectorAll('img')];
  const images = {
    total: imgs.length,
    missingAlt: imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).length,
  };
  return { links, images };
}

// ── Keyword intelligence ─────────────────────────────────────────────────────

function firstParagraphText(root) {
  const p = root.querySelector('p');
  return p ? (p.textContent || '').toLowerCase() : '';
}

function hasKeyword(text, kw) {
  if (!kw) return false;
  // Unicode-aware whole-word match (matches keywordDensity; fixes accented/
  // non-Latin keywords reporting "not found").
  return countKeyword(text, kw) > 0;
}

// Common English stopwords — a bigram made entirely of these ("and the",
// "of the") is noise, so it's excluded from related-phrase suggestions.
const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'his', 'has', 'had', 'him', 'she', 'its', 'that', 'this', 'with', 'from', 'they', 'have', 'were', 'will', 'your', 'their', 'what', 'when', 'been', 'them', 'than', 'then', 'into', 'over', 'such', 'only', 'also', 'more', 'most', 'some', 'a', 'an', 'is', 'to', 'of', 'in', 'on', 'it', 'as', 'at', 'be', 'or', 'by', 'we', 'do', 'if', 'so', 'up', 'no']);

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

export function keywordIntelligence(root, text, keyword, metaDescription) {
  const kw = String(keyword || '').trim().toLowerCase();
  const h1 = root.querySelector('h1');
  const subs = [...root.querySelectorAll('h2,h3')];
  return {
    keyword: kw,
    inH1: kw ? hasKeyword((h1 && h1.textContent) || '', kw) : null,
    inFirstParagraph: kw ? hasKeyword(firstParagraphText(root), kw) : null,
    inSubheadings: kw ? subs.some((h) => hasKeyword(h.textContent || '', kw)) : null,
    inMeta: kw ? hasKeyword(metaDescription || '', kw) : null,
    related: relatedPhrases(text),
  };
}

export { isExternal, TRANSITIONS };
