/**
 * @openeditor-premium/seo — Phase 19.4 SEO Analyzer.
 *
 * Premium, READ-ONLY content analysis: keyword density, heading structure +
 * outline warnings, Flesch readability, meta-description assessment, and a
 * pass/warn checklist with actionable hints. Gated on the 'seo' feature id.
 *
 *   const host = await createPremiumHost({ license, keys });
 *   editor.plugins.install(createSeoPlugin(host, { keyword: 'rich text editor' }));
 *   // → toolbar button (opens the panel) + editor.analyzeSeo(opts) (headless)
 *
 * Config (install-time, editor._config.seo, or per-call): keyword,
 * metaDescription.
 */
import { gatePremiumPlugin } from '@openeditor-premium/runtime';
import { rawSeoSpec } from './seo-plugin.js';

/** The registered feature id this package requires. */
export const FEATURE_ID = 'seo';

/**
 * @param {object} host   a resolved createPremiumHost() result
 * @param {object} [config] default analysis options ({ keyword, metaDescription })
 * @returns {object} installable plugin spec (active or graceful-degrade stub)
 */
export function createSeoPlugin(host, config = {}) {
  return gatePremiumPlugin(host, FEATURE_ID, rawSeoSpec(config));
}

export { analyzeSeo } from './seo-analyze.js';
export { fleschReadingEase } from './readability.js';
