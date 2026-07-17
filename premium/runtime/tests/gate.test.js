/**
 * gatePremiumPlugin — allowed passes the spec through untouched; denied
 * yields a same-name stub that degrades gracefully (19.3). The stub is also
 * driven through the REAL core PluginManager to prove it honors the plugin
 * contract (install/uninstall lifecycle) exactly like a real plugin.
 */
import { describe, it, expect, vi } from 'vitest';
import { gatePremiumPlugin } from '../src/gated-plugin.js';
import { PluginManager } from '../../../packages/core/src/plugins/plugin-manager.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) } };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) } };

function makeSpec() {
  return { name: 'premium-x', install: vi.fn(), destroy: vi.fn() };
}

/** Minimal editor double satisfying PluginManager + the notice surface. */
function makeEditor() {
  const listeners = new Map();
  const editor = {
    _wrapper: document.createElement('div'),
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); },
    off(ev, fn) {
      const arr = listeners.get(ev) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    emit(ev, payload) { for (const fn of [...(listeners.get(ev) || [])]) fn(payload); },
    logger: null,
    toolbar: null,
  };
  document.body.appendChild(editor._wrapper);
  return editor;
}

describe('gatePremiumPlugin — verdicts', () => {
  it('allowed → returns the raw spec IDENTITY (zero wrapping overhead)', () => {
    const spec = makeSpec();
    expect(gatePremiumPlugin(ALLOW, 'dev.smoke', spec)).toBe(spec);
  });

  it('denied → same-name stub; raw install/destroy are NEVER called', () => {
    const spec = makeSpec();
    const stub = gatePremiumPlugin(DENY, 'dev.smoke', spec);
    expect(stub).not.toBe(spec);
    expect(stub.name).toBe('premium-x');
    const editor = makeEditor();
    stub.install(editor);
    stub.destroy();
    expect(spec.install).not.toHaveBeenCalled();
    expect(spec.destroy).not.toHaveBeenCalled();
  });

  it('denied install emits premiumDenied with feature, plugin, and reason', () => {
    const editor = makeEditor();
    const seen = [];
    editor.on('premiumDenied', (p) => seen.push(p));
    gatePremiumPlugin(DENY, 'dev.smoke', makeSpec()).install(editor);
    expect(seen).toEqual([{ featureId: 'dev.smoke', plugin: 'premium-x', reason: 'no-license' }]);
  });

  it('denied install shows the upgrade notice; host.upgradeNotice=false suppresses it', () => {
    const shown = makeEditor();
    gatePremiumPlugin(DENY, 'dev.smoke', makeSpec()).install(shown);
    expect(shown._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();

    const quiet = makeEditor();
    gatePremiumPlugin({ ...DENY, upgradeNotice: false }, 'dev.smoke', makeSpec()).install(quiet);
    expect(quiet._wrapper.querySelector('[data-oe-premium-notice]')).toBeNull();
  });

  it('integration mistakes throw loudly: bad host, bad spec', () => {
    expect(() => gatePremiumPlugin(null, 'dev.smoke', makeSpec())).toThrow(/premium host/);
    expect(() => gatePremiumPlugin(ALLOW, 'dev.smoke', { name: 'x' })).toThrow(/spec/);
    expect(() => gatePremiumPlugin(ALLOW, 'dev.smoke', null)).toThrow(/spec/);
  });
});

describe('gatePremiumPlugin — denied stub under the REAL PluginManager', () => {
  it('installs, reports installed, uninstalls — full lifecycle without touching the editor', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor);
    editor.plugins = pm;

    const stub = gatePremiumPlugin(DENY, 'dev.smoke', makeSpec());
    pm.install(stub);
    expect(pm.isInstalled('premium-x')).toBe(true);
    // graceful degrade: notice present, nothing else changed in the wrapper
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();

    pm.uninstall('premium-x');
    expect(pm.isInstalled('premium-x')).toBe(false);
  });

  it('an allowed plugin under the manager runs its real install', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor);
    const spec = makeSpec();
    pm.install(gatePremiumPlugin(ALLOW, 'dev.smoke', spec));
    expect(spec.install).toHaveBeenCalledTimes(1);
  });
});
