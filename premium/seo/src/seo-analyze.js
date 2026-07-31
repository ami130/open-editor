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
import { contentDepth, linkImageSeo, keywordIntelligence, MIN_PROSE_WORDS, STOPWORDS } from './seo-advanced.js';
import { advancedChecks, snippetPreview } from './seo-checks.js';
import { normalizeOptions } from './seo-config.js';

export { MIN_PROSE_WORDS };
export { normalizeOptions } from './seo-config.js';

// Block-level tags whose boundaries are word separators. `textContent` joins
// adjacent blocks with NO whitespace ("<td>Net</td><td>Sales</td>" \u2192 "NetSales",
// "<li>a</li><li>b</li>" \u2192 "ab"), which under-counts words in table/list/multi-
// paragraph content. We insert a space after each block element's text so the
// word tokenizer sees real word boundaries.
const BLOCK_SEL = 'p,div,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre,figcaption,dt,dd,caption,tr,br,section,article,header,footer,main,ul,ol,dl,table';

/** Parse an HTML string into a detached root <div> (ONE parse per analysis). */
function parseRoot(html, doc) {
  const root = doc.createElement('div');
  root.innerHTML = typeof html === 'string' ? html : '';
  return root;
}

/** Resolve a (root element) OR (html string, doc) argument into a root element. */
function asRoot(rootOrHtml, doc) {
  if (rootOrHtml && typeof rootOrHtml === 'object' && rootOrHtml.querySelectorAll) return rootOrHtml;
  return parseRoot(rootOrHtml, doc || (typeof document !== 'undefined' ? document : null));
}

/**
 * Extract plain text from a parsed root, inserting a space at every block
 * boundary so words in tables/lists/adjacent paragraphs aren't glued together
 * (fixes real content being under-counted \u2192 wrongly "too little text"). Keeps
 * the same zero-width / NBSP normalization as editor.getText.
 */
function plainText(rootOrHtml, doc) {
  const root = asRoot(rootOrHtml, doc);
  // Clone so the boundary-spacing edit never touches the tree the rest of the
  // analysis walks (links, images, headings, keyword intel).
  const tmp = root.cloneNode(true);
  for (const b of tmp.querySelectorAll(BLOCK_SEL)) {
    // Append a real space text node after each block; harmless for inline-only.
    b.appendChild((tmp.ownerDocument || document).createTextNode(' '));
  }
  return (tmp.textContent || '')
    .replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')   // collapse the runs the inserted spaces create
    .trim();
}

/** Ordered list of headings: [{ level, text }]. Accepts a root OR (html, doc). */
function headings(rootOrHtml, doc) {
  const root = asRoot(rootOrHtml, doc);
  const out = [];
  for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    out.push({ level: Number(h.tagName[1]), text: (h.textContent || '').trim() });
  }
  return out;
}

/**
 * Structural warnings about the heading outline, aware of the content context.
 * @param {Array} hs  headings [{level,text}]
 * @param {object} [cfg] { expectH1, baseHeadingLevel } — from normalizeOptions.
 *   In 'full-page' context we expect exactly one H1 and a root of H1. In
 *   'body-fragment' context the page H1 lives OUTSIDE the editor, so an in-body
 *   H1 would DUPLICATE it: we don't require one and we FLAG its presence; the
 *   outline may legitimately start at H2.
 */
function headingWarnings(hs, cfg = {}) {
  const expectH1 = cfg.expectH1 !== false; // default to the old "require H1" if unset
  const baseLevel = cfg.baseHeadingLevel || 1;
  const warns = [];
  const h1s = hs.filter((h) => h.level === 1);
  if (hs.length === 0) warns.push('No headings — add structure with headings.');
  if (expectH1) {
    if (h1s.length === 0 && hs.length > 0) warns.push('No H1 — every document should have one top-level heading.');
    if (h1s.length > 1) warns.push(`Multiple H1s (${h1s.length}) — use exactly one.`);
  } else if (h1s.length > 0) {
    // Body fragment: an H1 here collides with the host page's own H1.
    warns.push(`Contains an H1 — the page title is usually the H1, so use H2+ inside the content (found ${h1s.length}).`);
  }
  // Skipped level relative to the expected base (e.g. base H2 → H4 is a skip).
  let prev = baseLevel;
  for (let i = 0; i < hs.length; i++) {
    if (hs[i].level - prev > 1) {
      warns.push(`Heading level jumps from H${prev} to H${hs[i].level} — don't skip levels.`);
      break;
    }
    prev = hs[i].level;
  }
  return warns;
}

/** Keyword density for a target phrase: keyword-WORDS / total words. */
function keywordDensity(text, keyword) {
  const total = words(text).length;
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw || !total) return { keyword: kw, count: 0, density: 0, total };
  // Unicode-aware whole-word/phrase count (accented + non-Latin keywords work).
  const count = countKeyword(text, kw);
  // Density must compare like units: a phrase occupies as many words as it HAS,
  // so a 3-word phrase used 3× fills 9 of the document's words, not 3. Counting
  // occurrences over total-words understated multi-word keyphrases by the
  // phrase length (the common SEO case). Multiply by the phrase's word count.
  const phraseWords = words(kw).length || 1;
  const density = Math.round(((count * phraseWords) / total) * 1000) / 10;
  return { keyword: kw, count, density, total };
}

/** Top-N most frequent words (excluding stopwords), for suggestions. */
function topWords(text, n = 5) {
  const counts = new Map();
  for (const w of words(text)) {
    // Keep tokens ≥3 chars that aren't stopwords — a length<4 cutoff previously
    // dropped legitimate short content terms ("seo", "api", "css", "roi"). (I11)
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

/** A meta-description assessment against the configured length band. */
function metaAssessment(meta, min = 120, max = 158) {
  const text = String(meta || '').trim();
  const len = text.length;
  let status = 'ok';
  let message = 'Good length.';
  if (len === 0) { status = 'warn'; message = 'No meta description set.'; }
  else if (len < min) { status = 'warn'; message = `Short (${len}) — aim for ${min}–${max} chars.`; }
  else if (len > max) { status = 'warn'; message = `Long (${len}) — search engines truncate past ~${max}.`; }
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
  // The public export is documented for headless/server scoring, so guard the
  // Document rather than throwing deep inside on doc.createElement. (C4)
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function') {
    throw new TypeError('analyzeSeo(html, opts, doc): a DOM Document is required (pass one in non-browser environments).');
  }
  const cfg = normalizeOptions(opts);
  const R = cfg.ruleset;
  // Parse the HTML into a walkable root exactly ONCE (was parsed 3× — for text,
  // headings, and advanced metrics). All derived data reads this one tree.
  const root = parseRoot(html, d);
  const text = plainText(root);
  const hs = headings(root);
  const outlineWarns = headingWarnings(hs, cfg);
  // Title: the host-provided page <title> (page-level, the correct source). In
  // full-page context ONLY, fall back to the first H1 as the title — in body-
  // fragment context an in-body H1 is not the page title, so we don't pretend.
  const effectiveTitle = cfg.title
    || (cfg.contentContext === 'full-page' ? (hs.find((h) => h.level === 1) || {}).text : '')
    || '';
  const hasTitle = !!effectiveTitle;
  const wordCount = words(text).length;
  const readability = fleschReadingEase(text);
  const density = keywordDensity(text, cfg.keyword);
  const meta = metaAssessment(cfg.metaDescription, R.metaMin, R.metaMax);
  const hasKeyword = !!cfg.keyword;
  const proseFloor = R.minProseWords;
  const enoughProse = wordCount >= proseFloor && readability.sentences > 0;
  // Readability metrics are English-calibrated; for other languages they are
  // N/A (a note), never a confident wrong score.
  const readingApplicable = cfg.readabilitySupported && enoughProse;

  const depth = contentDepth(text);
  const linkImage = linkImageSeo(root, cfg.siteUrl);
  const keywordIntel = keywordIntelligence(root, text, cfg.keyword, cfg.metaDescription, effectiveTitle);
  const snippet = snippetPreview({ title: effectiveTitle, metaDescription: cfg.metaDescription, url: cfg.url }, R);

  // Each check carries a `group` ('seo' | 'readability'), a severity `weight`
  // (how much it moves its category score) and whether it counts toward score.
  // Splitting into two category scores (like Yoast) means keyword/readability
  // signals DO count — without the old lurch, because each category has its own
  // stable denominator (the sum of the weights present in that category).
  const checks = [];
  // add(group, ok, label, hint, weight, opts?) — opts.na marks a check as NOT
  // APPLICABLE (e.g. "Images: 0" when the doc has no images). An n/a check is
  // shown as neutral guidance, NEVER as a green "good", and is excluded from
  // the score denominator so having no images/links can't inflate the score.
  const add = (group, ok, label, hint, weight = 1, opts = {}) => {
    const na = !!opts.na;
    checks.push({
      group,
      ok: na ? false : ok,
      na,
      label,
      // A hint is a corrective action. It belongs ONLY on a failing, applicable
      // check — never on an N/A row (nothing to fix) and never on a passing
      // one. Storing it on N/A rows produced nonsense like "Images: none — add
      // descriptive alt text".
      hint: (!na && !ok) ? (hint || '') : '',
      weight: na ? 0 : weight,
      scored: !na && weight > 0,
    });
  };

  // ── SEO group ────────────────────────────────────────────────────────────
  add('seo', wordCount >= R.minWords, `Word count: ${wordCount}`, `Aim for ${R.minWords}+ words for substantive content.`, 2);
  // Heading structure. In full-page context, missing H1 is a real problem; in
  // body-fragment context, an H1 is not required (and its PRESENCE is flagged
  // via outlineWarns). So the scored check is context-driven.
  if (cfg.expectH1) {
    add('seo', hs.some((h) => h.level === 1), 'Has an H1 heading', 'Add one top-level H1 heading.', 2);
  }
  add('seo', outlineWarns.length === 0, 'Heading outline is clean', outlineWarns[0] || '', 1);
  // Meta description: a SET-but-wrong-length meta is a real scored problem, but
  // an ABSENT meta is guidance (weight 0) — it shouldn't silently dock the score
  // of every fresh document for a field outside the editor content.
  add('seo', meta.status === 'ok', `Meta description: ${meta.message}`, meta.message, meta.length > 0 ? 1 : 0);
  if (hasKeyword) {
    // Keyword checks are N/A on a doc with no real prose to place the keyword in
    // — typing a keyword before writing shouldn't produce a wall of red. (#4)
    const kwNa = !enoughProse;
    const good = density.count > 0 && density.density >= R.densityMin && density.density <= R.densityMax;
    add('seo', good, kwNa ? 'Keyword density: n/a (add content)' : `Keyword “${density.keyword}”: ${density.count}× (${density.density}%)`,
      density.count === 0 ? 'Keyword not found in the content.'
        : density.density > R.densityMax ? 'Density high — may read as keyword stuffing.'
          : 'Density low — use the keyword a bit more.', 2, { na: kwNa });
    // Keyword-in-title only counts when a title actually exists (page-level).
    add('seo', keywordIntel.inTitle, 'Keyword in title', 'Add the focus keyword to the title.', 1, { na: !hasTitle });
    // Keyword-in-H1 only when an H1 is expected/present.
    add('seo', keywordIntel.inH1, 'Keyword in H1', 'Add the focus keyword to the H1 heading.', 1, { na: kwNa || !hs.some((h) => h.level === 1) });
    add('seo', keywordIntel.inFirstParagraph, 'Keyword in first paragraph', 'Mention the keyword early, in the first paragraph.', 1, { na: kwNa });
    add('seo', keywordIntel.inSubheading, 'Keyword in a subheading', 'Use the keyword in at least one subheading.', 1, { na: !hs.some((h) => h.level >= 2) });
  }

  // ── Readability group ──────────────────────────────────────────────────────
  // N/A when there's too little prose OR the language isn't English-calibrated
  // (Flesch/passive/transition heuristics are English-only). Between the floor
  // and full length the Flesch score is shown but down-weighted by the overall
  // confidence ramp. (Web guidance is Flesch ≥ 60. — I7)
  const readNaHint = !cfg.readabilitySupported
    ? `Readability: n/a (not available for “${cfg.lang}”)`
    : 'Readability: n/a (add more text to assess)';
  add('readability', readability.score >= R.fleschPassing,
    readingApplicable ? `Readability: ${readability.score} (${readability.label})` : readNaHint,
    'Text is hard to read — shorten sentences and words.', 2, { na: !readingApplicable });
  if (readingApplicable) {
    add('readability', true, `Grade level: ${readability.grade} · ${readability.readingTime} min read`, '', 0);
  }

  // Advanced content-depth / link / image / title checks. contentDepth metrics
  // (sentence length, passive, transitions) are English-calibrated too, so pass
  // the readability-applicability flag through to gate them.
  advancedChecks(add, { depth, linkImage, snippet, cfg, readingApplicable, hasTitle });

  // Host extension hook (#P2): append custom checks without forking. Given the
  // raw facts; whatever it returns is normalized through `add` and scored like
  // a built-in. A throwing/invalid hook is ignored so it can never break the
  // analysis for end users.
  if (cfg.customChecks) {
    try {
      const extra = cfg.customChecks({
        wordCount, headings: hs, keyword: density, readability, depth,
        linkImage, keywordIntel, meta, text, cfg,
      });
      if (Array.isArray(extra)) {
        for (const c of extra) {
          if (c && typeof c === 'object' && typeof c.label === 'string') {
            add(c.group === 'readability' ? 'readability' : 'seo', !!c.ok, c.label,
              typeof c.hint === 'string' ? c.hint : '',
              Number.isFinite(c.weight) ? c.weight : 1, { na: !!c.na });
          }
        }
      }
    } catch { /* a bad hook must not break analysis */ }
  }

  // Category sub-scores: weighted pass ratio within each group. Overall score =
  // the two category scores combined (SEO 60% / readability 40%). Weighted, so
  // "300 words + one H1 + a meta string" no longer trivially reaches 100.
  // Returns null when a category has NO scored checks (nothing to assess), so
  // the UI can show "—" instead of a misleading confident 100.
  const catScore = (group) => {
    const g = checks.filter((c) => c.group === group && c.scored);
    const wTotal = g.reduce((s, c) => s + c.weight, 0);
    if (!wTotal) return null;
    const wPass = g.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
    return Math.round((wPass / wTotal) * 100);
  };
  const seoScore = catScore('seo');
  const readabilityScore = catScore('readability');
  // Overall blend is SEO-dominant (70/30). Crucially, readability's share is
  // scaled by CONTENT SUFFICIENCY: a 4-word doc ("seo seo seo seo") scores
  // "very easy" but that must NOT prop up the overall score for thin content.
  // Confidence ramps 0→1 across 0→300 words, so below ~300 words the SEO score
  // (which correctly fails thin content) dominates and the total stays honest.
  // A null category (nothing to assess) drops out of the blend entirely.
  const sEff = seoScore == null ? 0 : seoScore;
  const rEff = readabilityScore == null ? 0 : readabilityScore;
  const readabilityConfidence = readabilityScore == null ? 0 : Math.min(1, wordCount / 300);
  const rWeight = 0.3 * readabilityConfidence;
  const sWeight = seoScore == null ? 0 : 1 - rWeight;
  const denom = sWeight + rWeight;
  const score = denom ? Math.round((sEff * sWeight + rEff * rWeight) / denom) : 0;

  return {
    // Report contract version — bump on any breaking shape change so consumers
    // reading the report object can guard on it.
    version: 1,
    score,
    seoScore,
    readabilityScore,
    wordCount,
    headings: hs,
    headingWarnings: outlineWarns,
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
    // Echo the resolved config so hosts/tests can see how the doc was analyzed.
    context: cfg.contentContext,
    lang: cfg.lang,
  };
}

export { keywordDensity, headings, headingWarnings, metaAssessment, topWords, plainText };
