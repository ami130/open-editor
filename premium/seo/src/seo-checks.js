/**
 * seo-checks.js — turns the raw advanced metrics (seo-advanced.js) into the
 * pass/warn checklist rows and the snippet-preview data. Kept separate so
 * seo-analyze.js stays under the file-length budget. All thresholds come from
 * the normalized ruleset (seo-config.js) so a host can tune them.
 */
import { DEFAULT_RULESET } from './seo-config.js';

/**
 * Build a Google-style snippet preview model (+ title-length assessment).
 * Title band comes from the ruleset (defaults ≈ the ~600px pixel proxy). When
 * a real URL isn't provided the URL line is marked illustrative rather than
 * showing a fabricated domain as if it were the page's real address.
 */
export function snippetPreview({ title, metaDescription, url }, ruleset = DEFAULT_RULESET) {
  const t = String(title || '').trim();
  const d = String(metaDescription || '').trim();
  const u = String(url || '').trim();
  const tLen = t.length;
  let titleStatus = 'ok';
  if (tLen === 0) titleStatus = 'warn';
  else if (tLen > ruleset.titleMax) titleStatus = 'warn';  // char approximation of ~600px
  else if (tLen < ruleset.titleMin) titleStatus = 'warn';  // too short wastes the slot
  return {
    title: t || 'Untitled document',
    url: u || 'https://example.com/page',
    urlIsPlaceholder: !u,
    description: d || 'No meta description — search engines will use page text.',
    titleLength: tLen,
    titleStatus,
  };
}

/**
 * Append advanced check rows via analyzeSeo's `add(group, ok, label, hint,
 * weight, opts)` helper. Content-depth rows are readability guidance; link/
 * image/title rows are SEO. A missing-attribute alt is a scored SEO problem; a
 * decorative alt="" is fine. Checks with NOTHING to assess (no images, no
 * links, non-English/short prose) are marked `{ na: true }` so they render as
 * neutral "n/a" — never a green "good" — and never count toward the score.
 *
 * @param add   analyzeSeo's add(group, ok, label, hint, weight, opts) helper
 * @param ctx   { depth, linkImage, snippet, cfg, readingApplicable, hasTitle }
 */
export function advancedChecks(add, { depth, linkImage, snippet, cfg, readingApplicable, hasTitle }) {
  const R = (cfg && cfg.ruleset) || DEFAULT_RULESET;
  // ── Content depth (readability guidance). N/A unless readability is
  // applicable (enough English prose) — these stats are English-calibrated and
  // meaningless on a fragment or a non-English doc, so they toggle in lock-step
  // with the readability check.
  const na = !readingApplicable;
  add('readability', depth.avgWordsPerSentence > 0 && depth.avgWordsPerSentence <= R.avgSentenceMax,
    na ? 'Avg sentence length: n/a' : `Avg sentence length: ${depth.avgWordsPerSentence} words`,
    `Sentences run long — aim for ≤${R.avgSentenceMax} words on average.`, 0, { na });
  add('readability', depth.longSentencePct <= R.longSentencePctMax,
    na ? 'Long sentences: n/a' : `Long sentences: ${depth.longSentencePct}%`,
    `Over ${R.longSentencePctMax}% of sentences are long — break some up.`, 0, { na });
  add('readability', depth.passivePct <= R.passivePctMax,
    na ? 'Passive voice: n/a' : `Passive voice: ~${depth.passivePct}% of sentences`,
    'High passive-voice use — prefer active voice for clarity.', 0, { na });
  add('readability', depth.transitionPct >= R.transitionPctMin,
    na ? 'Transition words: n/a' : `Transition words: ${depth.transitionPct}% of sentences`,
    'Few transition words — add connectors (however, therefore…) for flow.', 0, { na });

  // ── Link & image SEO. NO images / NO links → not applicable, not a pass.
  const hasImages = linkImage.images.total > 0;
  add('seo', linkImage.images.missingAlt === 0,
    hasImages
      ? `Images: ${linkImage.images.total} (${linkImage.images.missingAlt} missing alt${linkImage.images.decorative ? `, ${linkImage.images.decorative} decorative` : ''})`
      : 'Images: none',
    `${linkImage.images.missingAlt} image(s) have no alt attribute — add descriptive alt text.`, 1, { na: !hasImages });
  const L = linkImage.links;
  const hasLinks = L.total > 0;
  add('seo', L.empty === 0,
    hasLinks
      ? `Links: ${L.total} (${L.internal} internal, ${L.external} external${L.other ? `, ${L.other} other` : ''})`
      : 'Links: none',
    `${L.empty} link(s) have no anchor text.`, 1, { na: !hasLinks });
  // Generic / naked anchor text — shown only when present (guidance, unscored).
  if (L.generic > 0) {
    add('seo', false, `Generic anchor text: ${L.generic}`,
      'Replace “click here”/“read more” with descriptive, keyword-relevant anchor text.', 0);
  }
  if (L.naked > 0) {
    add('seo', false, `Raw URL as anchor text: ${L.naked}`,
      'Use descriptive words instead of a bare URL as the link text.', 0);
  }
  if (L.nofollow > 0) {
    add('seo', true, `Nofollow links: ${L.nofollow}`, '', 0);
  }

  // ── Title tag. The <title> is a PAGE-level field: when the host hasn't
  // provided one it's N/A (guidance to set it), not a scored failure —
  // consistent with the meta/images "don't penalize absent" philosophy.
  add('seo', snippet.titleStatus === 'ok',
    hasTitle ? `Title length: ${snippet.titleLength} chars` : 'Title: not set (provide the page title)',
    snippet.titleLength > R.titleMax ? `Title over ~${R.titleMax} chars — search engines may truncate it.`
      : `Title under ${R.titleMin} chars — use the space for keywords.`, 1, { na: !hasTitle });
}
