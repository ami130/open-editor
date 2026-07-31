/**
 * @openeditor-premium/seo/analyze — the PURE analyzer entry point.
 *
 * Imports NO DOM/panel/plugin code and NO premium-runtime gating, so a headless
 * or server-side consumer can score content without dragging in the editor UI:
 *
 *   import { analyzeSeo, normalizeOptions } from '@openeditor-premium/seo/analyze';
 *   import { JSDOM } from 'jsdom';
 *   const { document } = new JSDOM('<!doctype html><body>').window;
 *   const report = analyzeSeo(html, { keyword, contentContext: 'body-fragment' }, document);
 *
 * In Node you MUST pass a DOM `document` (3rd arg) — the package intentionally
 * does not bundle a DOM implementation; use jsdom/linkedom and hand it in.
 */
export {
  analyzeSeo, normalizeOptions, keywordDensity, headings, headingWarnings,
  metaAssessment, topWords, plainText, MIN_PROSE_WORDS,
} from './seo-analyze.js';
export { fleschReadingEase } from './readability.js';
export { DEFAULT_RULESET } from './seo-config.js';
