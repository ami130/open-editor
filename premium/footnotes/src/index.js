/**
 * @openeditor-premium/footnotes — Phase 19.12 Footnotes.
 *
 * Premium: auto-numbered footnotes. Insert a reference marker at the cursor
 * (a contenteditable="false" <sup>), and a managed <ol> notes section at the
 * document end stays in sync — markers renumber 1..N in document order and note
 * text follows its footnote across insertions/deletions. Gated on 'footnotes'.
 *
 *   const host = await createPremiumHost({ license, keys });
 *   editor.plugins.install(createFootnotesPlugin(host));
 *   // → "Insert footnote" toolbar button + editor.insertFootnote()
 *
 * The markup survives getHTML()/setHTML() (the core sanitizer allowlist was
 * extended in 19.12 for the footnote sup + notes-section attributes).
 */
import { gatePremiumPlugin } from '@openeditor-premium/runtime';
import { rawFootnotesSpec } from './footnotes-plugin.js';

/** The registered feature id this package requires. */
export const FEATURE_ID = 'footnotes';

/**
 * @param {object} host   a resolved createPremiumHost() result
 * @returns {object} installable plugin spec (active or graceful-degrade stub)
 */
export function createFootnotesPlugin(host) {
  return gatePremiumPlugin(host, FEATURE_ID, rawFootnotesSpec());
}

export { renumber, createRefMarker, refMarkers, notesSection } from './footnote-core.js';
