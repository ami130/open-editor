/**
 * one-package-e2e.test.js — Phase 1a-4 end-to-end proof.
 *
 * Proves the WHOLE "paste one key" promise through the bundled one-package flow,
 * with NO config.premiumPlugins and NO manual premium wiring — only a licenseKey:
 *
 *   1. `new OpenEditor(el, { licenseKey, licenseKeys, allowDevHost: false })` mounts synchronously
 *      with the FREE set (premium denied — enforceFreeTier is the 1a-3c default).
 *   2. _initLicense verifies the ES256 license OFFLINE inside core against the
 *      config-provided public key (D-A: config keyring, no network).
 *   3. applyEntitlements enables exactly the licensed premium: the bundled
 *      premium PLUGIN installs into the live editor (via the core gate that reads
 *      spec.featureId), and the gate now grants that premium id.
 *
 * The premium code is BUNDLED into openeditor-text (1a-3b) — this test imports
 * ONLY openeditor-text + the dev issuer (to mint a test license); it never
 * imports any @openeditor-premium package, mirroring a real customer install.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { generateDevKeyPair, signDevLicense } from '../../entitlements/src/issuer/dev-issuer.js';

function mint(features, domains = ['localhost']) {
  const { privateKeyPem, publicJwk } = generateDevKeyPair();
  const kid = 'e2e-kid';
  const token = signDevLicense({ privateKeyPem, kid, features, domains });
  return { token, licenseKeys: [{ kid, jwk: publicJwk }] };
}

/** Poll until `cond()` is true (Phase 1b: premium loads via async dynamic
 *  import — verify chain + chunk load resolve over several microtasks, so we
 *  wait deterministically rather than a fixed sleep). Fails after ~1s. */
async function waitFor(cond, ms = 1000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
}

// jsdom's location.hostname is 'localhost', which matches the minted domain.
describe('Phase 1a-4 — one-package paste-key end-to-end (bundled premium)', () => {
  it('a keyless editor: free works, ALL bundled premium is denied', () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { allowDevHost: false });
    try {
      expect(editor.isFeatureGranted('text.bold')).toBe(true);      // free
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);           // premium denied
      expect(editor.isFeatureGranted('export.docx')).toBe(false);
      expect(editor.isFeatureGranted('ai.panel')).toBe(false);
      // The bundled premium plugin is NOT installed without a license.
      expect(editor.plugins.isInstalled('export-pdf')).toBe(false);
    } finally { editor.destroy(); el.remove(); }
  });

  it('pasting a license granting "export.pdf" unlocks EXACTLY that premium + installs its bundled plugin, no extra config', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    // ONLY licenseKey + licenseKeys — no premiumPlugins, no manual wiring.
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      // Sync constructor already returned; verify + lazy chunk load are async.
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));

      // Purchased premium unlocked AND its bundled plugin installed live.
      expect(editor.isFeatureGranted('export.pdf')).toBe(true);
      expect(editor.plugins.isInstalled('export-pdf')).toBe(true);
      // Free still free.
      expect(editor.isFeatureGranted('text.bold')).toBe(true);
      // Premium NOT purchased stays denied + not installed.
      expect(editor.isFeatureGranted('export.docx')).toBe(false);
      expect(editor.plugins.isInstalled('export-docx')).toBe(false);
      expect(editor.isFeatureGranted('ai.panel')).toBe(false);
    } finally { editor.destroy(); el.remove(); }
  });

  it('a wrong-domain license unlocks NOTHING premium (fails closed), editor still works free', async () => {
    const { token, licenseKeys } = mint(['export.pdf'], ['not-this-host.example.com']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      await new Promise((r) => setTimeout(r, 150)); // settle (absence assertion, generous headroom under load): verify + any lazy load resolve, then assert premium stayed OFF
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);      // domain mismatch → denied
      expect(editor.plugins.isInstalled('export-pdf')).toBe(false);
      expect(editor.isFeatureGranted('text.bold')).toBe(true); // free unaffected
    } finally { editor.destroy(); el.remove(); }
  });

  it('a garbage license key unlocks nothing premium and never throws (editor mounts free)', async () => {
    const errors = [];
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: 'not-a-real-token', licenseKeys: [], allowDevHost: false });
    try {
      await new Promise((r) => setTimeout(r, 150)); // settle (absence assertion, generous headroom under load): verify + any lazy load resolve, then assert premium stayed OFF
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
      expect(editor.isFeatureGranted('text.bold')).toBe(true);
    } catch (e) { errors.push(e); }
    finally { editor.destroy(); el.remove(); }
    expect(errors).toEqual([]); // never throws on a bad key
  });

  it('a multi-feature license unlocks all purchased premium plugins at once', async () => {
    const { token, licenseKeys } = mint(['export.pdf', 'export.docx']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      await waitFor(() => editor.plugins.isInstalled('export-pdf')
        && editor.plugins.isInstalled('export-docx'));
      expect(editor.plugins.isInstalled('export-pdf')).toBe(true);
      expect(editor.plugins.isInstalled('export-docx')).toBe(true);
      // AI/SEO not shipped → never installed.
      expect(editor.isFeatureGranted('ai.panel')).toBe(false);
      expect(editor.plugins.isInstalled('seo')).toBe(false);
    } finally { editor.destroy(); el.remove(); }
  });
});

// Gap-1 (Phase 1 audit): the licenseError event must FIRE on a bad license so
// failure is observable, not silent. Covers wrong-domain, expired, and garbage.
describe('Phase 1 — licenseError event fires on an invalid license (not silent)', () => {
  function onceEvent(editor, name, ms = 1000) {
    return new Promise((resolve) => {
      editor.on(name, (payload) => resolve(payload));
      setTimeout(() => resolve(null), ms); // timeout guard so a miss fails loudly
    });
  }

  it('wrong-domain license → licenseError { reason: "domain-mismatch" }, premium stays off', async () => {
    const { token, licenseKeys } = mint(['export.pdf'], ['not-this-host.example.com']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      const payload = await onceEvent(editor, 'licenseError');
      expect(payload).toBeTruthy();
      expect(payload.reason).toBe('domain-mismatch');
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
    } finally { editor.destroy(); el.remove(); }
  });

  it('expired license → licenseError { reason: "expired" }', async () => {
    const { privateKeyPem, publicJwk } = generateDevKeyPair();
    const kid = 'exp-kid';
    // iat in the past + short ttl so exp is already behind now.
    const iat = Math.floor(Date.now() / 1000) - 10_000;
    const token = signDevLicense({ privateKeyPem, kid, features: ['export.pdf'], domains: ['localhost'], iat, ttlSeconds: 100 });
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys: [{ kid, jwk: publicJwk }], allowDevHost: false });
    try {
      const payload = await onceEvent(editor, 'licenseError');
      expect(payload).toBeTruthy();
      expect(payload.reason).toBe('expired');
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
    } finally { editor.destroy(); el.remove(); }
  });

  it('garbage key → licenseError fires (a reason string), editor stays free, never throws', async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: 'not-a-real-token', licenseKeys: [], allowDevHost: false });
    try {
      const payload = await onceEvent(editor, 'licenseError');
      expect(payload).toBeTruthy();
      expect(typeof payload.reason).toBe('string'); // malformed/unknown-kid/etc.
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
      expect(editor.isFeatureGranted('text.bold')).toBe(true); // free unaffected
    } finally { editor.destroy(); el.remove(); }
  });

  it('a VALID license does NOT fire licenseError', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    let errored = false;
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    editor.on('licenseError', () => { errored = true; });
    try {
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      expect(errored).toBe(false); // clean success, no error event
    } finally { editor.destroy(); el.remove(); }
  });

  // DX fix: localhost is exempt BY DEFAULT so a developer building locally is
  // never blocked. jsdom's host is 'localhost', so a key bound to a DIFFERENT
  // domain still unlocks here with the default allowDevHost.
  it('DEV EXEMPTION (default): a production-domain key still unlocks premium on localhost', async () => {
    const { token, licenseKeys } = mint(['export.pdf'], ['production-only.example.com']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys }); // allowDevHost defaults true
    try {
      const granted = await waitFor(() => editor.isFeatureGranted('export.pdf') === true);
      expect(granted).toBe(true);
    } finally { editor.destroy(); el.remove(); }
  });

  // DX fix: a failed-to-unlock license logs a clear console.warn by default so a
  // developer isn't left guessing (opt out with licenseWarnings:false).
  it('WARNING: a wrong-domain license logs a clear console.warn (default on)', async () => {
    const { token, licenseKeys } = mint(['export.pdf'], ['not-this-host.example.com']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const warnings = [];
    const orig = console.warn;
    console.warn = (...a) => { warnings.push(a.join(' ')); };
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      await onceEvent(editor, 'licenseError');
      await waitFor(() => warnings.some((w) => /OpenEditor.*FREE mode/i.test(w)));
      const hit = warnings.find((w) => /OpenEditor.*FREE mode/i.test(w));
      expect(hit).toBeTruthy();
      expect(hit).toMatch(/domain/i);         // names the reason
      expect(hit).not.toContain(token);        // NEVER logs the key
    } finally { console.warn = orig; editor.destroy(); el.remove(); }
  });

  it('WARNING: licenseWarnings:false silences the console.warn', async () => {
    const { token, licenseKeys } = mint(['export.pdf'], ['not-this-host.example.com']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const warnings = [];
    const orig = console.warn;
    console.warn = (...a) => { warnings.push(a.join(' ')); };
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false, licenseWarnings: false });
    try {
      await onceEvent(editor, 'licenseError');
      await new Promise((r) => setTimeout(r, 50));
      expect(warnings.some((w) => /OpenEditor.*FREE mode/i.test(w))).toBe(false);
    } finally { console.warn = orig; editor.destroy(); el.remove(); }
  });
});

// Phase 2-1: premiumReady signals when async-loaded premium is installed (the
// event wrappers surface as onPremiumReady). Fires on a real change to the
// installed premium set; deduped so an unchanged re-apply does not re-fire.
describe('Phase 2 — premiumReady event (async premium load signal)', () => {
  it('fires with the installed premium once the license unlocks it', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const events = [];
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    editor.on('premiumReady', (p) => events.push(p.installed));
    try {
      // Deterministic: wait until a premiumReady carrying 'export-pdf' has arrived
      // (no fixed sleep — robust under full-suite load).
      await waitFor(() => events.some((inst) => inst.includes('export-pdf')));
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toContain('export-pdf');
      // deduped: no two consecutive identical installed-sets.
      const sigs = events.map((e) => [...e].sort().join(','));
      expect(new Set(sigs).size).toBe(sigs.length);
    } finally { editor.destroy(); el.remove(); }
  });

  it('re-applying the SAME grant does NOT re-fire premiumReady', async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { enforceFreeTier: true, allowDevHost: false });
    let fires = 0;
    editor.on('premiumReady', () => { fires += 1; });
    try {
      editor.applyEntitlements({ isGranted: (id) => id === 'export.pdf' });
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      const afterFirst = fires;
      editor.applyEntitlements({ isGranted: (id) => id === 'export.pdf' }); // unchanged
      // Absence assertion (no new event): let the re-applied async path fully
      // settle. 150ms is generous headroom vs the local dynamic-import tick, so
      // this stays green under full-suite load rather than flaking.
      await new Promise((r) => setTimeout(r, 150));
      expect(fires).toBe(afterFirst);
    } finally { editor.destroy(); el.remove(); }
  });
});

// Phase 2-1b: setLicenseKey applies a license at RUNTIME (the reactive path the
// wrappers call when a licenseKey prop changes) — unlocks premium in place, no
// remount, same editor instance.
describe('Phase 2 — setLicenseKey (runtime license, in place)', () => {
  it('setting a license after mount unlocks premium on the SAME editor instance', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { allowDevHost: false }); // mounted keyless
    try {
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
      const same = editor;
      await editor.setLicenseKey(token, licenseKeys);
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      expect(editor.isFeatureGranted('export.pdf')).toBe(true);
      expect(editor).toBe(same); // no remount
    } finally { editor.destroy(); el.remove(); }
  });

  it('setLicenseKey on a destroyed editor no-ops (no throw)', async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { allowDevHost: false });
    editor.destroy(); el.remove();
    await editor.setLicenseKey('x', []); // must not throw
    expect(editor.isDestroyed()).toBe(true);
  });

  it('DOWNGRADE (audit #2): clearing the key GATE-DENIES premium AND tears down the installed plugin (no remount)', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      expect(editor.isFeatureGranted('export.pdf')).toBe(true);
      expect(typeof editor.exportPdf).toBe('function'); // premium imperative API present

      // Clear the license → downgrade.
      await editor.setLicenseKey(null);

      // The GATE denies premium (access revocation) …
      expect(editor.isFeatureGranted('export.pdf')).toBe(false);
      // … AND the premium plugin is UNINSTALLED in place (audit #2 fix): its
      // imperative method is gone and it's no longer installed — no gate-bypassing
      // onClick/exportPdf survives. Free features remain (text.bold still granted).
      expect(editor.plugins.isInstalled('export-pdf')).toBe(false);
      expect(editor.exportPdf).toBeUndefined();
      expect(editor.isFeatureGranted('text.bold')).toBe(true);
    } finally { editor.destroy(); el.remove(); }
  });

  it('DOWNGRADE (audit #2): re-adding the key re-installs premium in place (round-trip)', async () => {
    const { token, licenseKeys } = mint(['export.pdf']);
    const el = document.createElement('div'); document.body.appendChild(el);
    const editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    try {
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      await editor.setLicenseKey(null);
      expect(editor.plugins.isInstalled('export-pdf')).toBe(false);
      // Re-apply the same key → premium comes back, no remount.
      await editor.setLicenseKey(token, licenseKeys);
      await waitFor(() => editor.plugins.isInstalled('export-pdf'));
      expect(editor.isFeatureGranted('export.pdf')).toBe(true);
      expect(typeof editor.exportPdf).toBe('function');
    } finally { editor.destroy(); el.remove(); }
  });
});
