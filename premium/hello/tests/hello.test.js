/**
 * hello-premium — template smoke test: the gated factory activates under an
 * allowing host and degrades under a denying one. (Real-crypto grant/deny is
 * covered by the runtime package's host tests + the playground e2e.)
 */
import { describe, it, expect } from 'vitest';
import { createHelloPremiumPlugin, FEATURE_ID } from '../src/index.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) } };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) } };

function makeEditor() {
  const editor = { _wrapper: document.createElement('div'), emit() {} };
  document.body.appendChild(editor._wrapper);
  return editor;
}

describe('hello-premium (template shape)', () => {
  it('declares the internal smoke-test feature id', () => {
    expect(FEATURE_ID).toBe('dev.smoke');
  });

  it('allowed host → install marks the wrapper, destroy unmarks it', () => {
    const editor = makeEditor();
    const plugin = createHelloPremiumPlugin(ALLOW);
    plugin.install(editor);
    expect(editor._wrapper.getAttribute('data-oe-premium-hello')).toBe('on');
    plugin.destroy();
    expect(editor._wrapper.hasAttribute('data-oe-premium-hello')).toBe(false);
  });

  it('denied host → wrapper untouched, upgrade notice shown instead', () => {
    const editor = makeEditor();
    createHelloPremiumPlugin(DENY).install(editor);
    expect(editor._wrapper.hasAttribute('data-oe-premium-hello')).toBe(false);
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();
  });
});
