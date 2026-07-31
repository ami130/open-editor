/**
 * license-dx.test.js — Phase 2 Vue licensing DX.
 *
 * First-class `licenseKey`/`licenseKeys` props, `license-error`/`premium-ready`
 * emits, and the REACTIVE licenseKey (Option A) — changing the prop re-verifies
 * in place and unlocks premium with NO remount (same core instance).
 *
 * Resolves `openeditor-text` from its built dist (premium bundle + license flow
 * must be built in packages/core before running).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { OpenEditor } from '../src/index.js';
import { generateDevKeyPair, signDevLicense } from '../../entitlements/src/issuer/dev-issuer.js';

let wrapper;
afterEach(() => { if (wrapper) wrapper.unmount(); wrapper = null; });

function mint(features, domains = ['localhost']) {
  const { privateKeyPem, publicJwk } = generateDevKeyPair();
  const kid = 'vue-kid';
  return { token: signDevLicense({ privateKeyPem, kid, features, domains }), keys: [{ kid, jwk: publicJwk }] };
}
const wait = async (c, ms = 1500) => {
  const s = Date.now();
  while (!c()) { if (Date.now() - s > ms) return false; await new Promise((r) => setTimeout(r, 5)); }
  return true;
};

describe('Phase 2 — Vue licenseKey as a first-class prop', () => {
  it('a valid licenseKey prop unlocks premium on mount', async () => {
    const { token, keys } = mint(['export.pdf']);
    wrapper = mount(OpenEditor, { props: { licenseKey: token, licenseKeys: keys } });
    const ed = wrapper.vm.editor;
    const ok = await wait(() => ed && ed.plugins.isInstalled('export-pdf'));
    expect(ok).toBe(true);
    expect(ed.isFeatureGranted('export.pdf')).toBe(true);
    expect(ed.isFeatureGranted('text.bold')).toBe(true);
  });

  it('no licenseKey → free editor, premium denied', async () => {
    wrapper = mount(OpenEditor, {});
    await wait(() => wrapper.vm.editor);
    expect(wrapper.vm.editor.isFeatureGranted('export.pdf')).toBe(false);
    expect(wrapper.vm.editor.isFeatureGranted('text.bold')).toBe(true);
  });
});

describe('Phase 2 — Vue license-error / premium-ready emits', () => {
  it('emits license-error with the reason on a wrong-domain key', async () => {
    const { token, keys } = mint(['export.pdf'], ['not-this-host.example.com']);
    // allowDevHost:false → strict prod gate (localhost is exempt by default now).
    wrapper = mount(OpenEditor, { props: { licenseKey: token, licenseKeys: keys, config: { allowDevHost: false } } });
    await wait(() => wrapper.emitted('license-error'));
    const ev = wrapper.emitted('license-error');
    expect(ev).toBeTruthy();
    expect(ev[0][0].reason).toBe('domain-mismatch');
  });

  it('emits premium-ready with the installed premium after a valid key', async () => {
    const { token, keys } = mint(['export.pdf']);
    wrapper = mount(OpenEditor, { props: { licenseKey: token, licenseKeys: keys } });
    await wait(() => {
      const ev = wrapper.emitted('premium-ready');
      return ev && ev.some((call) => call[0].installed.includes('export-pdf'));
    });
    const ev = wrapper.emitted('premium-ready');
    expect(ev[ev.length - 1][0].installed).toContain('export-pdf');
  });
});

describe('Phase 2 — Vue reactive licenseKey (Option A: re-verify in place)', () => {
  it('changing the licenseKey prop unlocks premium WITHOUT a remount', async () => {
    const { token, keys } = mint(['export.pdf']);
    wrapper = mount(OpenEditor, { props: { licenseKey: null, licenseKeys: keys } });
    await wait(() => wrapper.vm.editor);
    const before = wrapper.vm.editor;
    expect(before.isFeatureGranted('export.pdf')).toBe(false);

    await wrapper.setProps({ licenseKey: token });
    const ok = await wait(() => wrapper.vm.editor && wrapper.vm.editor.plugins.isInstalled('export-pdf'));
    expect(ok).toBe(true);
    expect(wrapper.vm.editor.isFeatureGranted('export.pdf')).toBe(true);
    expect(wrapper.vm.editor).toBe(before); // same instance — re-verified in place
  });

  it('changing licenseKeys ONLY (keyring rotation, key unchanged) also re-verifies in place', async () => {
    // Mount with the RIGHT key but a WRONG keyring → verification fails, premium denied.
    const { token, keys } = mint(['export.pdf']);
    const wrongKeys = [{ kid: 'other', jwk: keys[0].jwk }]; // kid mismatch → unknown-kid
    // allowDevHost:false → the wrong keyring genuinely denies (localhost would
    // otherwise be exempt by default and unlock premium regardless of the keyring).
    wrapper = mount(OpenEditor, { props: { licenseKey: token, licenseKeys: wrongKeys, config: { allowDevHost: false } } });
    await wait(() => wrapper.vm.editor);
    const before = wrapper.vm.editor;
    // Wrong keyring → the key can't verify → premium denied.
    await new Promise((r) => setTimeout(r, 60));
    expect(before.isFeatureGranted('export.pdf')).toBe(false);

    // Rotate ONLY licenseKeys to the correct one (licenseKey unchanged) → must re-verify.
    await wrapper.setProps({ licenseKeys: keys });
    const ok = await wait(() => wrapper.vm.editor.plugins.isInstalled('export-pdf'));
    expect(ok).toBe(true);
    expect(wrapper.vm.editor.isFeatureGranted('export.pdf')).toBe(true);
    expect(wrapper.vm.editor).toBe(before); // same instance
  });
});
