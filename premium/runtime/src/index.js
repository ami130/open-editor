/**
 * @openeditor-premium/runtime — Phase 19 foundation (19.2 host + gate, 19.3
 * graceful degrade). The ONLY way premium feature packages attach to an
 * editor:
 *
 *   const host = await createPremiumHost({ license, keys });
 *   editor.plugins.install(createSomePremiumPlugin(host));
 *
 * Depends only on @openeditors/entitlements — imports NOTHING from the editor
 * core (the editor instance arrives at install time), so this package can
 * never leak into the free bundle.
 */
export { createPremiumHost, REASON } from './premium-host.js';
export { gatePremiumPlugin } from './gated-plugin.js';
export { showUpgradeNotice, resetUpgradeNotice } from './upgrade-notice.js';
