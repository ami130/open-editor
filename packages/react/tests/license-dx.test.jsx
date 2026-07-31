/**
 * license-dx.test.jsx — Phase 2 React licensing DX.
 *
 * Proves the first-class DX on the React wrapper: `licenseKey`/`licenseKeys` as
 * top-level props (not buried in `config`), `onLicenseError`/`onPremiumReady`
 * callbacks, and the REACTIVE licenseKey (Option A) — changing the prop after
 * mount re-verifies in place and unlocks premium with NO remount.
 *
 * Tests resolve `openeditor-text` from its built dist, so the premium bundle +
 * license flow must be built (npm run build in packages/core) before running.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef, createElement as h } from 'react';
import { OpenEditor } from '../src/index.js';
import { generateDevKeyPair, signDevLicense } from '../../entitlements/src/issuer/dev-issuer.js';

afterEach(() => cleanup());

function mint(features, domains = ['localhost']) {
  const { privateKeyPem, publicJwk } = generateDevKeyPair();
  const kid = 'react-kid';
  return { token: signDevLicense({ privateKeyPem, kid, features, domains }), keys: [{ kid, jwk: publicJwk }] };
}
const wait = async (c, ms = 1500) => {
  const s = Date.now();
  while (!c()) { if (Date.now() - s > ms) return false; await new Promise((r) => setTimeout(r, 5)); }
  return true;
};

describe('Phase 2 — React licenseKey as a first-class prop', () => {
  it('a valid licenseKey prop unlocks premium on mount (no config nesting, no manual wiring)', async () => {
    const { token, keys } = mint(['export.pdf']);
    const ref = createRef();
    render(h(OpenEditor, { ref, licenseKey: token, licenseKeys: keys }));
    const ok = await wait(() => ref.current && ref.current.editor && ref.current.editor.plugins.isInstalled('export-pdf'));
    expect(ok).toBe(true);
    expect(ref.current.editor.isFeatureGranted('export.pdf')).toBe(true);
    expect(ref.current.editor.isFeatureGranted('text.bold')).toBe(true); // free still free
  });

  it('no licenseKey → free editor, premium denied', async () => {
    const ref = createRef();
    render(h(OpenEditor, { ref }));
    await wait(() => ref.current && ref.current.editor);
    expect(ref.current.editor.isFeatureGranted('export.pdf')).toBe(false);
    expect(ref.current.editor.isFeatureGranted('text.bold')).toBe(true);
  });
});

describe('Phase 2 — React onLicenseError / onPremiumReady callbacks', () => {
  it('onLicenseError fires with the reason on a wrong-domain key', async () => {
    const { token, keys } = mint(['seo'], ['not-this-host.example.com']);
    let err = null;
    // allowDevHost:false → exercise the STRICT prod gate (localhost is exempt by
    // default now, which would otherwise unlock premium and fire no error).
    render(h(OpenEditor, { licenseKey: token, licenseKeys: keys, config: { allowDevHost: false }, onLicenseError: (p) => { err = p; } }));
    await wait(() => err !== null);
    expect(err).toBeTruthy();
    expect(err.reason).toBe('domain-mismatch');
  });

  it('onPremiumReady fires with the installed premium after a valid key', async () => {
    const { token, keys } = mint(['export.pdf']);
    const events = [];
    render(h(OpenEditor, { licenseKey: token, licenseKeys: keys, onPremiumReady: (p) => events.push(p.installed) }));
    await wait(() => events.some((inst) => inst.includes('export-pdf')));
    expect(events[events.length - 1]).toContain('export-pdf');
  });
});

describe('Phase 2 — React reactive licenseKey (Option A: re-verify in place)', () => {
  it('changing the licenseKey prop after mount unlocks premium WITHOUT a remount', async () => {
    const { token, keys } = mint(['export.pdf']);
    const ref = createRef();
    // Mount with NO key.
    const { rerender } = render(h(OpenEditor, { ref, licenseKey: null, licenseKeys: keys }));
    await wait(() => ref.current && ref.current.editor);
    const instanceBefore = ref.current.editor;
    expect(instanceBefore.isFeatureGranted('export.pdf')).toBe(false);

    // Change the prop → reactive re-verify.
    rerender(h(OpenEditor, { ref, licenseKey: token, licenseKeys: keys }));
    const ok = await wait(() => ref.current.editor && ref.current.editor.plugins.isInstalled('export-pdf'));
    expect(ok).toBe(true);
    expect(ref.current.editor.isFeatureGranted('export.pdf')).toBe(true);
    // Same editor instance — the prop change re-verified in place, did not remount.
    expect(ref.current.editor).toBe(instanceBefore);
  });
});
