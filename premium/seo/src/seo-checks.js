/**
 * seo-checks.js — turns the raw advanced metrics (seo-advanced.js) into the
 * pass/warn checklist rows and the snippet-preview data. Kept separate so
 * seo-analyze.js stays under the file-length budget and the check thresholds
 * live in one place.
 */

/** Build a Google-style snippet preview model (+ title-length assessment). */
export function snippetPreview({ title, metaDescription, url }) {
  const t = String(title || '').trim();
  const d = String(metaDescription || '').trim();
  const tLen = t.length;
  let titleStatus = 'ok';
  if (tLen === 0) titleStatus = 'warn';
  else if (tLen > 60) titleStatus = 'warn';        // Google truncates ~60 chars
  else if (tLen < 30) titleStatus = 'warn';        // too short wastes the slot
  return {
    title: t || 'Untitled document',
    url: url || 'https://example.com/page',
    description: d || 'No meta description — search engines will use page text.',
    titleLength: tLen,
    titleStatus,
  };
}

/**
 * Append advanced check rows to `checks` (mutates, mirroring analyzeSeo's own
 * `pass` helper). These are GUIDANCE, not scored — `pass` is wrapped to force
 * scored=false so they never swing the overall score (see analyzeSeo).
 * @param {(ok:boolean,label:string,hint?:string,scored?:boolean)=>void} rawPass
 */
export function advancedChecks(rawPass, { depth, linkImage, keywordIntel, snippet, hasKeyword }) {
  const pass = (ok, label, hint) => rawPass(ok, label, hint, false);
  // ── Content depth ──
  pass(depth.avgWordsPerSentence > 0 && depth.avgWordsPerSentence <= 20,
    `Avg sentence length: ${depth.avgWordsPerSentence} words`,
    'Sentences run long — aim for ≤20 words on average.');
  pass(depth.longSentencePct <= 25,
    `Long sentences: ${depth.longSentencePct}%`,
    'Over 25% of sentences exceed 25 words — break some up.');
  pass(depth.passivePct <= 15,
    `Passive voice: ~${depth.passivePct}% of sentences`,
    'High passive-voice use — prefer active voice for clarity.');
  pass(depth.transitionPct >= 20,
    `Transition words: ${depth.transitionPct}% of sentences`,
    'Few transition words — add connectors (however, therefore…) for flow.');

  // ── Link & image SEO ──
  pass(linkImage.images.missingAlt === 0,
    `Images: ${linkImage.images.total} (${linkImage.images.missingAlt} missing alt)`,
    `${linkImage.images.missingAlt} image(s) have no alt text — add descriptive alt.`);
  pass(linkImage.links.empty === 0,
    `Links: ${linkImage.links.total} (${linkImage.links.internal} internal, ${linkImage.links.external} external)`,
    `${linkImage.links.empty} link(s) have no anchor text.`);

  // ── Keyword intelligence (only when a keyword is set) ──
  if (hasKeyword) {
    pass(!!keywordIntel.inH1, 'Keyword appears in the H1', 'Put the focus keyword in the H1 heading.');
    pass(!!keywordIntel.inFirstParagraph, 'Keyword in the first paragraph', 'Mention the keyword early (first paragraph).');
    pass(!!keywordIntel.inSubheadings, 'Keyword in a subheading', 'Use the keyword in at least one H2/H3.');
    pass(!!keywordIntel.inMeta, 'Keyword in the meta description', 'Include the keyword in the meta description.');
  }

  // ── Title tag (from the snippet) ──
  pass(snippet.titleStatus === 'ok',
    `Title length: ${snippet.titleLength} chars`,
    snippet.titleLength === 0 ? 'No title set.'
      : snippet.titleLength > 60 ? 'Title over ~60 chars — Google truncates it.'
        : 'Title under 30 chars — use the space for keywords.');
}
