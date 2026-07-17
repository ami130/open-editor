/**
 * 22.1 — Feature-ID registry.
 *
 * The shared vocabulary between premium plugins (which DECLARE required IDs),
 * licenses (which GRANT them), and the future admin plan-builder (which
 * COMPOSES them into packages). Plans are just sets of these IDs, so a new
 * plan never requires a code change anywhere.
 *
 * Conventions (enforced by tests):
 *  - IDs are dot-namespaced, lower-camel segments: `group.feature`.
 *  - ADDITIVE-ONLY. An ID, once shipped, is NEVER renamed or removed — a
 *    renamed ID silently invalidates every license that granted the old name.
 *    Deprecate in place (mark `deprecated: true`) instead.
 *  - `since` is the entitlements-package version an ID first appeared in.
 *
 * This module imports NOTHING (no core, no crypto) — it is pure data + lookups.
 */

/** @typedef {{ title: string, since: string, deprecated?: boolean }} FeatureMeta */

/** @type {Record<string, FeatureMeta>} */
export const FEATURES = {
  'export.pdf': { title: 'Export to PDF', since: '0.1.0' },
  'export.docx': { title: 'Export to Word (DOCX)', since: '0.1.0' },
  'export.markdown': { title: 'Markdown Export', since: '0.1.0' },
  'import.word': { title: 'Word Import (DOCX → editor)', since: '0.1.0' },
  'seo': { title: 'SEO Analyzer', since: '0.1.0' },
  'footnotes': { title: 'Footnotes', since: '0.1.0' },
  'versionHistory': { title: 'Version History', since: '0.1.0' },
  'comments': { title: 'Comments', since: '0.1.0' },
  'track.changes': { title: 'Track Changes / Suggestion Mode', since: '0.1.0' },
  'collab.rt': { title: 'Real-time Collaboration', since: '0.1.0' },
  'ai.panel': { title: 'AI Writing Panel (Chat)', since: '0.1.0' },
  'ai.quickActions': { title: 'AI Quick Actions (rewrite/summarize/tone)', since: '0.1.0' },
  'ai.review': { title: 'AI Review (suggestions)', since: '0.1.0' },
  'ai.translate': { title: 'AI Translate', since: '0.1.0' },
  'restrictedEditing.roles': { title: 'Restricted Editing — role-based zones', since: '0.1.0' },
  'lists.legal': { title: 'Multi-level Legal Lists', since: '0.1.0' },
  'outline.toc': { title: 'Document Outline + Table of Contents', since: '0.1.0' },
  'mergeFields': { title: 'Merge Fields + Content Templates', since: '0.1.0' },
  'pagination': { title: 'Pagination', since: '0.1.0' },
  // Internal pipeline smoke-test flag — proves the gate end-to-end without
  // touching a sellable id. Never composed into a customer plan.
  'dev.smoke': { title: 'Internal smoke-test feature (never sold)', since: '0.1.0' },
};

const ID_SHAPE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;

/** True if `id` is a shape-valid feature id string (registered or not). */
export function isValidFeatureIdShape(id) {
  return typeof id === 'string' && ID_SHAPE.test(id);
}

/** True if `id` is a known, registered feature. */
export function isRegisteredFeature(id) {
  return Object.prototype.hasOwnProperty.call(FEATURES, id);
}

/** Metadata for a registered id, or null. */
export function getFeature(id) {
  return isRegisteredFeature(id) ? FEATURES[id] : null;
}

/** All registered feature ids (sorted, stable). */
export function allFeatureIds() {
  return Object.keys(FEATURES).sort();
}

/**
 * Validate a list of feature ids destined for a license/plan. Returns
 * `{ ok, unknown, malformed }` — `unknown` are shape-valid but unregistered
 * (a typo or a not-yet-registered id), `malformed` fail the shape rule.
 * The issuer (22.4) rejects a grant unless `ok` is true.
 */
export function validateFeatureList(ids) {
  const malformed = [];
  const unknown = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!isValidFeatureIdShape(id)) malformed.push(id);
    else if (!isRegisteredFeature(id)) unknown.push(id);
  }
  return { ok: malformed.length === 0 && unknown.length === 0, unknown, malformed };
}
