/**
 * @openeditor-premium/hello — the premium feature-package TEMPLATE.
 *
 * The shape every real Phase 19 feature copies:
 *   1. declare ONE registered feature id (the sellable unit)
 *   2. keep the raw plugin spec module-private
 *   3. export ONLY a gated factory taking the premium host — so an ungated
 *      install is impossible by construction
 *
 * The observable effect is deliberately trivial (a wrapper data-attribute):
 * just enough for unit/e2e assertions to prove the whole license pipeline —
 * mint → verify → FeatureManager → gate → activate/degrade — end to end.
 */
import { gatePremiumPlugin } from '@openeditor-premium/runtime';

/** The registered feature id this package requires (internal, never sold). */
export const FEATURE_ID = 'dev.smoke';

function rawSpec() {
  let ed = null;
  return {
    name: 'hello-premium',
    install(editor) {
      ed = editor;
      if (editor._wrapper) editor._wrapper.setAttribute('data-oe-premium-hello', 'on');
    },
    destroy() {
      if (ed && ed._wrapper) ed._wrapper.removeAttribute('data-oe-premium-hello');
      ed = null;
    },
  };
}

/**
 * @param {object} host a resolved createPremiumHost() result
 * @returns {object} installable plugin spec (active or graceful-degrade stub)
 */
export function createHelloPremiumPlugin(host) {
  return gatePremiumPlugin(host, FEATURE_ID, rawSpec());
}
