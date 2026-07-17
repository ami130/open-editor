/**
 * seo-analyze.js — pure document SEO analysis. `analyzeSeo(html, opts, doc)`
 * parses a detached copy of the editor's HTML and returns a structured report:
 * word count, heading structure (+ outline warnings), keyword density, a
 * readability score, and a checklist of pass/warn findings.
 *
 * Read-only: never mutates the editor content. No side effects. The `doc` arg
 * (a Document) is used only to parse the HTML string into walkable nodes.
 */
import { fleschReadingEase, words, countKeyword } from './readability.js';
import { contentDepth, linkImageSeo, keywordIntelligence } from './seo-advanced.js';
import { advancedChecks, snippetPreview } from './seo-checks.js';

/** Extract plain text from HTML (same zero-width handling as editor.getText). */
function plainText(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = typeof html === 'string' ? html : '';
  // Strip zero-width chars + normalize NBSP -> space (matches editor.getText).
  // Written as \u escapes to keep the source ASCII (no-irregular-whitespace).
  return (tmp.textContent || '')
    .replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/** Ordered list of headings: [{ level, text }]. */
function headings(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = typeof html === 'string' ? html : '';
  const out = [];
  for (const h of tmp.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    out.push({ level: Number(h.tagName[1]), text: (h.textContent || '').trim() });
  }
  return out;
}

/** Structural warnings about the heading outline. */
function headingWarnings(hs) {
  const warns = [];
  const h1s = hs.filter((h) => h.level === 1);
  if (hs.length === 0) warns.push('No headings — add structure with H1/H2.');
  if (h1s.length === 0 && hs.length > 0) warns.push('No H1 — every document should have one top-level heading.');
  if (h1s.length > 1) warns.push(`Multiple H1s (${h1s.length}) — use exactly one.`);
  // Skipped level (e.g. H2 → H4) hurts the outline.
  for (let i = 1; i < hs.length; i++) {
    if (hs[i].level - hs[i - 1].level > 1) {
      warns.push(`Heading level jumps from H${hs[i - 1].level} to H${hs[i].level} — don't skip levels.`);
      break;
    }
  }
  return warns;
}

/** Keyword density for a target phrase: occurrences / total words. */
function keywordDensity(text, keyword) {
  const total = words(text).length;
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw || !total) return { keyword: kw, count: 0, density: 0, total };
  // Unicode-aware whole-word/phrase count (accented + non-Latin keywords work).
  const count = countKeyword(text, kw);
  return { keyword: kw, count, density: Math.round((count / total) * 1000) / 10, total };
}

/** Top-N most frequent words (excluding short stopwords), for suggestions. */
function topWords(text, n = 5) {
  const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'his', 'has', 'had', 'him', 'she', 'its', 'that', 'this', 'with', 'from', 'they', 'have', 'were', 'will', 'your', 'their', 'what', 'when', 'been', 'them', 'than', 'then']);
  const counts = new Map();
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

/** A meta-description assessment against best-practice length (120-158). */
function metaAssessment(meta) {
  const text = String(meta || '').trim();
  const len = text.length;
  let status = 'ok';
  let message = 'Good length.';
  if (len === 0) { status = 'warn'; message = 'No meta description set.'; }
  else if (len < 120) { status = 'warn'; message = `Short (${len}) — aim for 120–158 chars.`; }
  else if (len > 158) { status = 'warn'; message = `Long (${len}) — search engines truncate past ~158.`; }
  return { length: len, status, message };
}

/**
 * Full analysis.
 * @param {string} html   editor.getHTML() output
 * @param {object} [opts] { keyword, metaDescription }
 * @param {Document} doc  a Document for parsing
 * @returns {object} the report
 */
export function analyzeSeo(html, opts = {}, doc) {
  const text = plainText(html, doc);
  const hs = headings(html, doc);
  const wordCount = words(text).length;
  const readability = fleschReadingEase(text);
  const density = keywordDensity(text, opts.keyword);
  const meta = metaAssessment(opts.metaDescription);

  // Advanced metrics (parse the HTML into a walkable root once).
  const root = doc.createElement('div');
  root.innerHTML = typeof html === 'string' ? html : '';
  const depth = contentDepth(text);
  const linkImage = linkImageSeo(root);
  const keywordIntel = keywordIntelligence(root, text, opts.keyword, opts.metaDescription);
  const snippet = snippetPreview({ title: opts.title, metaDescription: opts.metaDescription, url: opts.url });

  const checks = [];
  // `scored` marks a check as counting toward the overall score. Keyword-
  // placement + advanced-guidance checks are shown but NOT scored, so the
  // score doesn't lurch the instant a keyword is typed (the denominator would
  // otherwise jump from ~6 to ~11 and collapse the percentage). The CORE set
  // (word count, H1, outline, meta, readability) is always scored and stable.
  const pass = (ok, label, hint, scored = true) =>
    checks.push({ ok, label, hint: ok ? '' : (hint || ''), scored });

  pass(wordCount >= 300, `Word count: ${wordCount}`, 'Aim for 300+ words for substantive content.');
  pass(hs.some((h) => h.level === 1), 'Has an H1 heading', 'Add one top-level H1 heading.');
  pass(headingWarnings(hs).length === 0, 'Heading outline is clean', headingWarnings(hs)[0] || '');
  if (opts.keyword) {
    // Healthy density is ~0.5–2.5%: present but not stuffed. (Guidance, unscored.)
    const good = density.count > 0 && density.density >= 0.5 && density.density <= 2.5;
    pass(good, `Keyword “${density.keyword}”: ${density.count}× (${density.density}%)`,
      density.count === 0 ? 'Keyword not found in the content.'
        : density.density > 2.5 ? 'Density high — may read as keyword stuffing.'
          : 'Density low — use the keyword a bit more.', false);
  }
  pass(meta.status === 'ok', `Meta description: ${meta.message}`, meta.message);
  pass(readability.score >= 50, `Readability: ${readability.score} (${readability.label})`,
    'Text is hard to read — shorten sentences and words.');

  // Advanced checks (content depth, link/image, keyword intelligence, title) —
  // all pushed as UNSCORED guidance so they inform without swinging the score.
  advancedChecks(pass, { depth, linkImage, keywordIntel, snippet, hasKeyword: !!opts.keyword });

  const scored = checks.filter((c) => c.scored);
  const score = scored.length
    ? Math.round((scored.filter((c) => c.ok).length / scored.length) * 100) : 100;

  return {
    score,
    wordCount,
    headings: hs,
    headingWarnings: headingWarnings(hs),
    keyword: density,
    topWords: topWords(text),
    readability,
    meta,
    depth,
    linkImage,
    keywordIntel,
    snippet,
    related: keywordIntel.related,
    checks,
  };
}

export { keywordDensity, headings, headingWarnings, metaAssessment, topWords, plainText };
