/**
 * paste-pipeline.js — Phase 12.A: the staged paste-cleanup pipeline.
 *
 * The paste flow used to be inlined in editor-paste.js as "sanitize → insert".
 * Phase 12 turns that into an ordered list of pure string→string transforms
 * that run BETWEEN the security sanitizer and insertion:
 *
 *   raw clipboard HTML
 *     → security sanitizer            (always first — never skipped)
 *     → source-specific cleanup       (Word / GDocs, added in 12.C/12.E)
 *     → structural normalization      (added in 12.F)
 *     → style→semantic promotion      (added in 12.F)
 *   → clean HTML string
 *
 * Each stage is `(html: string, ctx) → string` — a PURE function of the HTML
 * plus a small read-only context, so every stage is unit-testable in jsdom
 * without an editor instance (the same discipline used for the table ops).
 *
 * 12.A ships the skeleton with a SINGLE stage (the sanitizer) so behaviour is
 * byte-for-byte identical to the old inline path; later sub-phases append
 * stages without touching this orchestrator.
 */

/**
 * Run `html` through the ordered `stages`. A stage that throws is skipped (its
 * input is passed through unchanged) so one bad transform can never abort the
 * whole paste — cleanliness is best-effort; security already ran first.
 *
 * @param {string} html      HTML to clean (already security-sanitized by stage 0)
 * @param {Array<(html: string, ctx: object) => string>} stages
 * @param {object} [ctx]     read-only context handed to each stage
 * @returns {string} the cleaned HTML
 */
export function runPastePipeline(html, stages, ctx = {}) {
  let out = typeof html === 'string' ? html : '';
  if (!Array.isArray(stages)) return out;
  for (const stage of stages) {
    if (typeof stage !== 'function') continue;
    try {
      const next = stage(out, ctx);
      if (typeof next === 'string') out = next;
    } catch {
      /* stage failed — keep the previous output, don't abort the paste */
    }
  }
  return out;
}

/**
 * Build the ordered stage list for a paste. 12.A returns just the security
 * sanitizer; sub-phases will push source-cleanup / normalize / promote stages
 * here (ordered by the plan) based on the detected source and config.
 *
 * @param {object} deps
 * @param {(html: string) => string} deps.sanitize  the editor's _sanitizeHTML
 * @returns {Array<(html: string, ctx: object) => string>}
 */
export function buildPasteStages({ sanitize }) {
  const stages = [];
  if (typeof sanitize === 'function') {
    stages.push((html) => sanitize(html));
  }
  return stages;
}
