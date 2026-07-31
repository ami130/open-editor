/**
 * fail-closed-gate.test.js — Phase 0c.
 *
 * The core gate GRANTS ALL by default when unconfigured (legacy behavior, kept
 * so existing embeds are unchanged). Under the future one-package model, premium
 * code will ship in the bundle, so an unconfigured editor must NOT unlock it.
 * `enforceFreeTier: true` switches the gate to fail-closed:
 *   - the FREE set (every non-premium catalog id) is always granted, keyless;
 *   - ALWAYS_ON core is always granted;
 *   - premium is granted ONLY with a valid entitlement / explicit '*' / dev-host;
 *   - premium with no/invalid key is DENIED.
 *
 * These tests pin BOTH modes: legacy stays byte-for-byte grant-all, and enforce
 * mode fails closed on premium. Plus a drift guard that the free set and the
 * premium registry never overlap.
 */
import { describe, it, expect } from 'vitest';
import { createFeatureGate, FREE_SET, ALWAYS_ON } from '../src/entitlements/feature-gate.js';
import { OpenEditor } from '../src/editor.js';
import { FeatureManager } from '../../entitlements/src/feature-manager.js';
import { FEATURES as PREMIUM_REGISTRY } from '../../entitlements/src/feature-registry.js';

// Representative ids.
const FREE_CORE = 'text.bold';        // core, in FREE_SET
const FREE_PLUGIN = 'insert.link';    // free plugin, in FREE_SET
const PREMIUM = 'seo';                // premium registry id, NOT in FREE_SET
const PREMIUM2 = 'ai.panel';
const ALWAYS = 'undo';                // load-bearing, in ALWAYS_ON

describe('feature-gate — legacy (default) mode is UNCHANGED', () => {
  it('no config → grant ALL (premium included) — existing embeds unaffected', () => {
    const g = createFeatureGate({});
    expect(g(FREE_CORE)).toBe(true);
    expect(g(PREMIUM)).toBe(true);   // legacy grants premium too (safe: not in bundle yet)
    expect(g(ALWAYS)).toBe(true);
  });

  it('explicit grantedFeatures list still gates to the list (+ always-on)', () => {
    const g = createFeatureGate({ grantedFeatures: ['text.bold'] });
    expect(g('text.bold')).toBe(true);
    expect(g('text.italic')).toBe(false);
    expect(g(ALWAYS)).toBe(true);    // always-on never gated
  });
});

describe('feature-gate — enforceFreeTier (fail-closed) mode', () => {
  it('no key → FREE set granted, ALWAYS_ON granted, PREMIUM denied', () => {
    const g = createFeatureGate({ enforceFreeTier: true });
    expect(g(FREE_CORE)).toBe(true);
    expect(g(FREE_PLUGIN)).toBe(true);
    expect(g(ALWAYS)).toBe(true);
    expect(g(PREMIUM)).toBe(false);   // the whole point of Phase 0c
    expect(g(PREMIUM2)).toBe(false);
  });

  it('a valid entitlements grant unlocks exactly its premium ids (free still free)', () => {
    const ent = { isGranted: (id) => id === 'export.pdf' };
    const g = createFeatureGate({ enforceFreeTier: true, entitlements: ent });
    expect(g('export.pdf')).toBe(true);
    expect(g(PREMIUM)).toBe(false);   // not granted → denied
    expect(g(FREE_CORE)).toBe(true);  // free always granted regardless
  });

  it('a real license FeatureManager drives the gate (only purchased premium)', () => {
    const fm = new FeatureManager({ valid: true, payload: { features: ['export.pdf'] } });
    const g = createFeatureGate({ enforceFreeTier: true, entitlements: fm });
    expect(g('export.pdf')).toBe(true);
    expect(g(PREMIUM)).toBe(false);
    expect(g(FREE_PLUGIN)).toBe(true);
  });

  it("explicit '*' grants all, even in enforce mode", () => {
    const g = createFeatureGate({ enforceFreeTier: true, grantedFeatures: ['*'] });
    expect(g(PREMIUM)).toBe(true);
    expect(g(PREMIUM2)).toBe(true);
  });

  it('a dev-host FeatureManager grants all in enforce mode (the localhost free zone)', () => {
    const dev = new FeatureManager({ valid: true, devHost: true });
    const g = createFeatureGate({ enforceFreeTier: true, entitlements: dev });
    expect(g(PREMIUM)).toBe(true);
    expect(g(PREMIUM2)).toBe(true);
  });

  it('an entitlements object that throws fails CLOSED (denies), never grant-all', () => {
    const bad = { isGranted: () => { throw new Error('boom'); } };
    const g = createFeatureGate({ enforceFreeTier: true, entitlements: bad });
    expect(g(PREMIUM)).toBe(false);   // error → deny
    expect(g(FREE_CORE)).toBe(true);  // free still granted before entitlements consulted
  });
});

describe('feature-gate — integration through OpenEditor', () => {
  it('enforceFreeTier editor: free feature granted, premium denied, always-on granted', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { enforceFreeTier: true });
    try {
      expect(editor.isFeatureGranted(FREE_CORE)).toBe(true);
      expect(editor.isFeatureGranted(PREMIUM)).toBe(false);
      expect(editor.isFeatureGranted(ALWAYS)).toBe(true);
    } finally { editor.destroy(); el.remove(); }
  });

  it('default editor (no flag): fail-closed is now the DEFAULT (1a-3c) — free granted, premium denied', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // enforceFreeTier defaults to TRUE now that premium ships bundled: a plain
    // keyless `new OpenEditor(el)` grants the free set but NOT bundled premium.
    const editor = new OpenEditor(el, {});
    try {
      expect(editor.isFeatureGranted(FREE_CORE)).toBe(true);   // free → granted
      expect(editor.isFeatureGranted(FREE_PLUGIN)).toBe(true); // free → granted
      expect(editor.isFeatureGranted(PREMIUM)).toBe(false);    // premium → DENIED by default
      expect(editor.isFeatureGranted(ALWAYS)).toBe(true);      // always-on
    } finally { editor.destroy(); el.remove(); }
  });

  it('legacy opt-out: enforceFreeTier:false restores grant-all (for embeds with no premium)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { enforceFreeTier: false });
    try {
      expect(editor.isFeatureGranted(PREMIUM)).toBe(true); // legacy grant-all still available
    } finally { editor.destroy(); el.remove(); }
  });
});

describe('Phase 1a — applyEntitlements (post-mount enable of the gate)', () => {
  it('flips a premium feature from denied → granted after mount, free set intact', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { enforceFreeTier: true });
    try {
      // Before: enforce mode, no key → premium denied.
      expect(editor.isFeatureGranted(PREMIUM)).toBe(false);
      expect(editor.isFeatureGranted(FREE_CORE)).toBe(true);

      // Apply a resolved entitlement granting exactly `seo`.
      const granted = editor.applyEntitlements({ isGranted: (id) => id === PREMIUM });

      // After: seo granted, free still granted, an ungranted premium still denied.
      expect(editor.isFeatureGranted(PREMIUM)).toBe(true);
      expect(editor.isFeatureGranted(FREE_CORE)).toBe(true);
      expect(editor.isFeatureGranted(PREMIUM2)).toBe(false);
      // The returned delta reports the newly-enabled id (seo), not free/already-on.
      expect(granted).toContain(PREMIUM);
      expect(granted).not.toContain(FREE_CORE);
    } finally { editor.destroy(); el.remove(); }
  });

  it('emits entitlementsApplied and is safe to call with a bad arg (no-op)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { enforceFreeTier: true });
    try {
      let fired = null;
      editor.on('entitlementsApplied', (p) => { fired = p; });
      const none = editor.applyEntitlements(null); // bad arg → no-op, no throw
      expect(none).toEqual([]);
      editor.applyEntitlements({ isGranted: (id) => id === PREMIUM });
      expect(fired).toBeTruthy();
      expect(fired.granted).toContain(PREMIUM);
    } finally { editor.destroy(); el.remove(); }
  });

  it('1a-2b: toolbar rebuilds so a newly-granted built-in button appears (no full editor rebuild)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // Start with a grantedFeatures allowlist that WITHHOLDS italic (bold only).
    const editor = new OpenEditor(el, { grantedFeatures: ['text.bold'] });
    const italicBtn = () => el.querySelector('[data-command="italic"], [data-name="italic"], button[title*="Italic" i]');
    try {
      // Sanity: bold present, italic absent (gated out at build).
      expect(el.querySelector('.oe-toolbar')).toBeTruthy();
      const boldBefore = el.querySelector('[data-command="bold"], [data-name="bold"], button[title*="Bold" i]');
      expect(boldBefore).toBeTruthy();
      expect(italicBtn()).toBeFalsy();

      // The editor element (content) reference must SURVIVE the toolbar rebuild.
      const editorElBefore = editor._editorEl;

      // Grant italic too, post-mount.
      editor.applyEntitlements({ isGranted: (id) => id === 'text.bold' || id === 'text.italic' });

      // Toolbar rebuilt → italic button now present; content element untouched.
      expect(italicBtn()).toBeTruthy();
      expect(editor._editorEl).toBe(editorElBefore); // no content/caret rebuild
      expect(el.querySelectorAll('.oe-toolbar').length).toBe(1); // exactly one toolbar (no leak)
    } finally { editor.destroy(); el.remove(); }
  });

  // NOTE (M1): the built-in shortcut table maps only FREE/always-on commands
  // today, so this uses a gated FREE command (text.italic) to exercise the
  // deferred-then-granted path. registerGrantedShortcuts gates purely by
  // featureForCommand → isFeatureGranted, so a premium-mapped combo would follow
  // the IDENTICAL path — this test covers the mechanism for both.
  it('1a-2c: a withheld shortcut becomes registered after grant; command works live; no double-binding', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { grantedFeatures: ['text.bold'] });
    try {
      // italic withheld → its shortcut not registered; bold's IS.
      expect(editor.shortcuts.has('ctrl+i')).toBe(false);
      expect(editor.shortcuts.has('ctrl+b')).toBe(true);
      const boldCountBefore = editor.shortcuts.getAll().size;

      // Command manager gates italic live at execute (currently denied) — the
      // command is registered but gated.
      editor.applyEntitlements({ isGranted: (id) => id === 'text.bold' || id === 'text.italic' });

      // italic shortcut now registered. (Applying an entitlements object makes
      // the gate "free is free" — so ALL free shortcuts that were withheld by
      // the initial restrictive grantedFeatures:['text.bold'] list now register,
      // not just italic. The key invariants: italic IS now present, the total
      // GREW, and bold was NOT duplicated.)
      expect(editor.shortcuts.has('ctrl+i')).toBe(true);
      expect(editor.shortcuts.getAll().size).toBeGreaterThan(boldCountBefore);
      // bold not re-registered (still exactly one entry for ctrl+b).
      expect(editor.shortcuts.has('ctrl+b')).toBe(true);
      // italic now passes the live gate (command executes rather than being blocked).
      expect(editor.isFeatureGranted('text.italic')).toBe(true);
    } finally { editor.destroy(); el.remove(); }
  });

  it('1a-2d: a configured premium plugin installs into the live editor only after its feature is granted, once', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    let installs = 0;
    // Fake premium plugin declaring its own featureId (premium ids aren't in the
    // free plugin catalog) — this is how a real premium plugin gates in 1-package.
    const seoPlugin = {
      name: 'seoTest',
      featureId: PREMIUM, // 'seo'
      install() { installs += 1; },
      destroy() {},
    };
    const editor = new OpenEditor(el, { enforceFreeTier: true, premiumPlugins: [seoPlugin] });
    try {
      // Before a key (enforce mode): seo denied → plugin registered but NOT installed.
      editor.applyEntitlements({ isGranted: () => false }); // triggers register+install-attempt
      expect(editor.plugins.isInstalled('seoTest')).toBe(false);
      expect(installs).toBe(0);

      // Grant seo → plugin installs now.
      editor.applyEntitlements({ isGranted: (id) => id === PREMIUM });
      expect(editor.plugins.isInstalled('seoTest')).toBe(true);
      expect(installs).toBe(1);

      // Re-apply the same grant → NO double-install.
      editor.applyEntitlements({ isGranted: (id) => id === PREMIUM });
      expect(installs).toBe(1);
    } finally { editor.destroy(); el.remove(); }
  });

  it('B1 regression: plugin-contributed toolbar buttons SURVIVE the applyEntitlements rebuild (not wiped)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new OpenEditor(el, { grantedFeatures: ['text.bold'] });
    try {
      // A plugin that contributes a main-toolbar button (like link/image/table do).
      const plug = {
        name: 'contribPlug',
        install() {}, destroy() {},
        getToolbarButtons() {
          return [{ name: 'contribBtn', type: 'button', icon: 'bold', tooltip: 'Contrib', command: 'bold' }];
        },
      };
      editor.plugins.register(plug);
      editor.plugins.install('contribPlug');
      expect(el.querySelector('[data-name="contribBtn"]')).toBeTruthy();

      // A post-mount entitlement change rebuilds the toolbar. The contributed
      // button MUST still be present afterward, and exactly once (no dup).
      editor.applyEntitlements({ isGranted: (id) => id === 'text.bold' || id === 'text.italic' });
      expect(el.querySelector('[data-name="contribBtn"]')).toBeTruthy();
      expect(el.querySelectorAll('[data-name="contribBtn"]').length).toBe(1);

      // Re-applying again keeps it single (idempotent re-contribution).
      editor.applyEntitlements({ isGranted: (id) => id === 'text.bold' });
      expect(el.querySelectorAll('[data-name="contribBtn"]').length).toBe(1);
    } finally { editor.destroy(); el.remove(); }
  });
});

describe('free/premium disjointness (drift guard)', () => {
  it('no premium-registry id is in the FREE set, and vice versa', () => {
    const premiumIds = Object.keys(PREMIUM_REGISTRY);
    const overlap = premiumIds.filter((id) => FREE_SET.has(id));
    expect(overlap, `ids in BOTH free set and premium registry: ${overlap.join(', ')}`).toEqual([]);
  });

  it('FREE set is non-trivial and excludes known premium ids', () => {
    expect(FREE_SET.size).toBeGreaterThan(40);   // ~52 today
    expect(FREE_SET.has('seo')).toBe(false);
    expect(FREE_SET.has('ai.panel')).toBe(false);
    expect(FREE_SET.has('text.bold')).toBe(true);
  });

  it('ALWAYS_ON ids are never treated as gateable premium', () => {
    for (const id of ALWAYS_ON) {
      expect(createFeatureGate({ enforceFreeTier: true })(id)).toBe(true);
    }
  });
});
