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

/** Count sentences by terminal punctuation, with a floor of 1 for any text. */
export function countSentences(text) {
  const matches = text.match(/[.!?]+(?=\s|$)/g);
  const n = matches ? matches.length : 0;
  return Math.max(1, n);
}

// CJK ideographs / kana / Hangul have no spaces — each character counts as its
// own "word" (matches the editor's status-bar word counter, status-bar.js).
const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3040-\u30FF]/g;

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
  // (?<![\p{L}\p{N}]) / (?![\p{L}\p{N}]) = Unicode word boundaries around the
  // phrase; CJK (no spaces) still matches since neighbors aren't L/N-adjacent
  // to the ASCII-bounded case — for CJK the lookarounds simply allow a match.
  let re;
  try {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu');
  } catch {
    // Lookbehind unsupported (very old engines) — fall back to a plain global.
    re = new RegExp(esc, 'giu');
  }
  return (text.toLowerCase().match(re) || []).length;
}

/** Heuristic syllable count for a single lowercase word (min 1). */
export function syllablesInWord(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Drop common silent endings that would over-count.
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  w = w.replace(/^y/, '');
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Total syllables across all words. */
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
  if (!nWords) return { score: 0, label: 'No text', words: 0, sentences: 0 };
  const nSentences = countSentences(text);
  const nSyllables = countSyllables(wordList);
  const raw = 206.835 - 1.015 * (nWords / nSentences) - 84.6 * (nSyllables / nWords);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, label: labelFor(score), words: nWords, sentences: nSentences };
}

function labelFor(score) {
  if (score >= 90) return 'Very easy';
  if (score >= 70) return 'Easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly difficult';
  if (score >= 30) return 'Difficult';
  return 'Very difficult';
}
