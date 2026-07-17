/**
 * 19.2/19.3 — the plugin gate. Every premium feature package wraps its raw
 * plugin spec with this before handing it to the consumer, so an ungated
 * premium plugin can never be installed by accident.
 *
 * The entitlement verdict is fixed by the time a host exists (createPremiumHost
 * resolved before any wrapping), so gating is decided HERE, once:
 *   - allowed → the raw spec is returned untouched (zero runtime overhead)
 *   - denied  → a stub spec with the same name: install() emits
 *     'premiumDenied' on the editor and shows the non-blocking upgrade
 *     notice, then no-ops. The free editor is never affected.
 *
 * RE-LICENSING AT RUNTIME (SPA applies a fetched license): wrap a fresh spec
 * with the new host, then uninstall + REGISTER + install —
 *   editor.plugins.uninstall(name);
 *   editor.plugins.register(create<Feature>Plugin(newHost)); // replaces stale spec
 *   editor.plugins.install(name);
 * (plugins.install(spec) alone resolves the previously-registered spec by
 * name and would resurrect the old license state.) Call resetUpgradeNotice()
 * too, so the degrade notice reflects the new grants.
 */
import { getFeature } from '@openeditors/entitlements';
import { showUpgradeNotice } from './upgrade-notice.js';

/**
 * @param {object} host    a resolved createPremiumHost() result
 * @param {string} featureId registered feature id this plugin requires
 * @param {object} spec    raw plugin spec ({ name, install, destroy, … })
 * @returns {object} an installable plugin spec (real or denied stub)
 */
export function gatePremiumPlugin(host, featureId, spec) {
  if (!host || !host.manager || typeof host.manager.gate !== 'function') {
    throw new Error('gatePremiumPlugin: a resolved premium host (createPremiumHost) is required.');
  }
  if (!spec || typeof spec.name !== 'string' || !spec.name
      || typeof spec.install !== 'function' || typeof spec.destroy !== 'function') {
    throw new Error('gatePremiumPlugin: spec must be a plugin ({ name, install, destroy }).');
  }

  const verdict = host.manager.gate(featureId);
  if (verdict.allowed) return spec;

  // Denied → same-name stub. No dependencies, no toolbar buttons, no keydown
  // hook — the plugin contributes NOTHING to the editor except the notice.
  const meta = getFeature(featureId);
  return {
    name: spec.name,
    install(editor) {
      try {
        editor.emit('premiumDenied', {
          featureId,
          plugin: spec.name,
          reason: verdict.reason,
        });
      } catch { /* an emit error must not break install */ }
      if (host.upgradeNotice !== false) {
        showUpgradeNotice(editor, {
          featureId,
          title: (meta && meta.title) || featureId,
          reason: verdict.reason,
        });
      }
    },
    destroy() { /* nothing was installed */ },
  };
}
