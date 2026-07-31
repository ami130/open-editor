/**
 * readability.js — Flesch Reading Ease, computed from plain text. Pure, no DOM.
 *
 * Flesch Reading Ease = 206.835 − 1.015·(words/sentences) − 84.6·(syllables/words)
 * Higher = easier. ~90-100 very easy; 60-70 plain English; <30 very hard.
 *
 * Syllable counting is heuristic (there is no exact rule without a dictionary);
 * the vowel-group method with common corrections is the standard approximation
 * every JS readability library uses. It's an ESTIMATE, labeled as such in the UI.
 */

// Common abbreviations whose trailing "." must NOT end a sentence. Kept short
// and lowercase; matched case-insensitively against the token before the dot.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie',
  'no', 'vol', 'fig', 'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'est',
  'approx', 'appt', 'apt', 'ave', 'blvd', 'rd', 'pp', 'al', 'ca', 'cf',
  'us', 'uk', 'am', 'pm', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
]);

/**
 * Split text into sentences, ONE definitive segmenter used everywhere (both the
 * Flesch word/sentence ratio AND content-depth read this, so their counts can
 * never diverge). Terminal .!? ends a sentence UNLESS it is:
 *   • a decimal point inside a number (3.14)            → digit both sides
 *   • an abbreviation (Dr. Smith, e.g., U.S.)           → known token before it
 *   • an initial / single-letter dot (J. R. R. Tolkien) → single letter before it
 * Ellipses (…, ...) collapse to a single boundary. Returns the trimmed
 * non-empty sentence strings.
 */
export function splitSentences(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const s = text.replace(/…/g, '...'); // normalize ellipsis char
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    // consume a run of terminal punctuation (…, !!!, ?!)
    let j = i;
    while (j + 1 < s.length && '.!?'.includes(s[j + 1])) j++;
    const next = s[j + 1];
    // must be followed by whitespace or end-of-text to be a boundary
    if (next !== undefined && !/\s/.test(next)) { i = j; continue; }
    // decimal: digit immediately before AND after the single dot
    if (ch === '.' && j === i && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '')) continue;
    // list ordinal: a short all-digit "word" ending in "." at start-of-text or
    // after whitespace ("1. First", "2. Second") is a list marker, not a
    // sentence end. (#3)
    if (ch === '.' && j === i) {
      const m = s.slice(0, i).match(/(^|\s)(\d{1,3})$/);
      if (m) { continue; }
    }
    // abbreviation / initial: look at the word immediately before the dot
    if (ch === '.' && j === i) {
      const before = s.slice(0, i);
      const m = before.match(/([\p{L}.]+)$/u);
      // Normalize by removing ALL internal/trailing dots so "e.g" and "u.s"
      // match the dot-less abbreviation keys ("eg", "us"), and a bare initial
      // ("j") is length 1.
      const tok = (m ? m[1] : '').toLowerCase().replace(/\./g, '');
      if (tok.length === 1 || ABBREVIATIONS.has(tok) || ABBREVIATIONS.has(tok.replace(/s$/, ''))) { continue; }
    }
    const sentence = s.slice(start, j + 1).trim();
    if (sentence) out.push(sentence);
    start = j + 1;
    i = j;
  }
  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Count sentences by the shared segmenter, with a floor of 1 for any text. */
export function countSentences(text) {
  return Math.max(1, splitSentences(text).length);
}

// CJK ideographs / kana / Hangul have no spaces — each character counts as its
// own "word" (matches the editor's status-bar word counter, status-bar.js).
const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3040-\u30FF]/g;
// Non-global twin for safe single-char membership tests (a /g regex advances
// lastIndex on .test(), which is a footgun \u2014 this one is stateless).
const CJK_CHAR = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3040-\u30FF]/;

/**
 * Split into word tokens. Unicode-aware: runs of letters/digits/apostrophes in
 * ANY script (so "café", "naïve", "Zürich", "Москва" tokenize correctly), plus
 * each CJK character as an individual token (no-space scripts). Fixes the
 * ASCII-only regex that reported 0 words for CJK and truncated accented Latin.
 */
export function words(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  // Pull CJK characters out as individual tokens first.
  const cjk = lower.match(CJK_RE) || [];
  // Remaining (non-CJK) text → letter/number runs across all scripts.
  const rest = lower.replace(CJK_RE, ' ')
    .match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}]+)?/gu) || [];
  return rest.concat(cjk);
}

/**
 * Count whole-word (Unicode-aware) occurrences of `keyword` in `text`. Uses
 * Unicode letter/number boundaries instead of ASCII \b, so accented and
 * non-Latin keywords ("café", "Москва", CJK) match — matching the tokenizer in
 * words(). Case-insensitive; phrase-aware; regex-special chars escaped.
 * @returns {number} occurrence count
 */
export function countKeyword(text, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw || typeof text !== 'string' || !text) return 0;
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // CJK (Chinese/Japanese/Korean) has NO word boundaries — its characters are
  // all \p{L}, so the word-boundary lookarounds `(?<![\p{L}\p{N}])` would ALWAYS
  // fail when the keyword begins/ends with a CJK char, silently returning 0 for
  // every CJK keyword. When either edge of the keyword is CJK, match plainly
  // (non-overlapping global) instead of applying Latin word boundaries. (#1)
  const cjkEdge = CJK_CHAR.test(kw[0]) || CJK_CHAR.test(kw[kw.length - 1]);
  let re;
  if (cjkEdge) {
    re = new RegExp(esc, 'gu');
  } else {
    try {
      re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu');
    } catch {
      // Lookbehind unsupported (very old engines) — fall back to a plain global.
      re = new RegExp(esc, 'giu');
    }
  }
  return (text.toLowerCase().match(re) || []).length;
}

/**
 * Heuristic syllable count for a single lowercase word (min 1).
 *
 * A pure-number token ("2024", "3") is estimated as one syllable per digit
 * ("two-oh-two-four" ≈ 4) — previously it stripped to empty and returned 0,
 * which made number-heavy text read as spuriously "very easy" (the 0-syllable
 * words deflated syllables/words). (C2)
 *
 * For real words: count MAXIMAL vowel groups (`[aeiouy]+`, not `{1,2}` which
 * split 3-vowel runs like "queue"/"beautiful" in two), drop a trailing silent
 * `e`, add a syllable back for a `-le` ending ("table", "cycle"), and only
 * strip `-ed` when it is NOT syllabic ("naked"/"added" keep their syllable).
 * (C1)
 */
export function syllablesInWord(word) {
  const raw = String(word || '').toLowerCase();
  // Pure number → one syllable per digit (min 1).
  if (/^\d+$/.test(raw)) return Math.max(1, raw.length);
  let w = raw.replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // A syllabic -ed: preceded by t or d ("wanted", "added") — keep it; otherwise
  // -ed is silent ("walked") — drop it. Likewise -es after a sibilant is a
  // syllable ("boxes"), else silent ("makes").
  const keepEd = /(?:[td])ed$/.test(w);
  const keepEs = /(?:[sxz]|ch|sh)es$/.test(w);
  if (!keepEd) w = w.replace(/ed$/, '');
  if (!keepEs) w = w.replace(/es$/, '');
  // Drop a trailing silent e, but NOT a "-le" consonant+le ending — there the
  // e is syllabic ("ta-ble", "cy-cle") and is kept so its vowel group counts.
  if (/[^aeioul]e$/.test(w)) w = w.slice(0, -1);
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 0);
}

/**
 * Total syllables across all words. Pure-number tokens contribute their
 * per-digit estimate (never 0), keeping the syllables/words ratio honest.
 */
export function countSyllables(wordList) {
  let total = 0;
  for (const w of wordList) total += syllablesInWord(w);
  return total;
}

/**
 * Flesch Reading Ease score + a human label. Returns null-ish safe values for
 * empty text (score 0, label 'No text').
 * @returns {{ score: number, label: string, words: number, sentences: number }}
 */
export function fleschReadingEase(text) {
  const wordList = words(text);
  const nWords = wordList.length;
  if (!nWords) return { score: 0, label: 'No text', words: 0, sentences: 0, grade: 0, readingTime: 0 };
  const nSentences = countSentences(text);
  const nSyllables = countSyllables(wordList);
  const wps = nWords / nSentences;      // words per sentence
  const spw = nSyllables / nWords;      // syllables per word
  const raw = 206.835 - 1.015 * wps - 84.6 * spw;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  // Flesch–Kincaid Grade Level (US school grade) — a second, widely-cited view.
  const gradeRaw = 0.39 * wps + 11.8 * spw - 15.59;
  const grade = Math.max(0, Math.round(gradeRaw * 10) / 10);
  // Reading time in minutes at ~200 wpm (rounded up, min 1 for non-empty text).
  const readingTime = Math.max(1, Math.round(nWords / 200));
  return { score, label: labelFor(score), words: nWords, sentences: nSentences, grade, readingTime };
}

function labelFor(score) {
  if (score >= 90) return 'Very easy';
  if (score >= 70) return 'Easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly difficult';
  if (score >= 30) return 'Difficult';
  return 'Very difficult';
}
