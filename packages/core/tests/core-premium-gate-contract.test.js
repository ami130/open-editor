/**
 * core-premium-gate-contract.test.js — Phase 2 fix regression (Gap #2, core side).
 *
 * The core editor gate consumes `config.entitlements` by calling `isGranted(id)`.
 * This proves the editor correctly drives its gate from ANY object implementing
 * that contract (a real license's FeatureManager now implements it too — proven
 * separately in the entitlements package). The bug was: an entitlements object
 * lacking isGranted() made the core gate silently grant-all; assert it doesn't.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

// A minimal object satisfying the core gate contract — the same shape a
// FeatureManager now exposes (isGranted === has). Grants ai.translate (premium)
// and withholds ai.review (premium). NOTE (Phase 1a-3c): under the one-package
// default (enforceFreeTier=true), FREE features (text.*, list.*) are ALWAYS
// granted regardless of the entitlements object — "free is free". So this
// object only meaningfully governs PREMIUM ids; the point of this test is that
// a PREMIUM id the object withholds (ai.review) is DENIED (no silent grant-all).
const GRANTED = new Set(['text.bold', 'list.bullet', 'ai.translate']);
const entitlements = { isGranted: (id) => GRANTED.has(id) };

let target; let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Gap #2 — core gate driven by an entitlements.isGranted object', () => {
  it('resolves PREMIUM features through the entitlements object; FREE stays free', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target, { entitlements });
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    expect(editor.isFeatureGranted('text.italic')).toBe(true);   // FREE → always granted (1a-3c)
    expect(editor.isFeatureGranted('list.bullet')).toBe(true);
    expect(editor.isFeatureGranted('undo')).toBe(true);          // always-on core
    expect(editor.isFeatureGranted('ai.translate')).toBe(true);  // premium the object GRANTS
    expect(editor.isFeatureGranted('ai.review')).toBe(false);    // premium the object WITHHOLDS
  });

  it('does NOT fall back to grant-all: a withheld PREMIUM id stays denied', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target, { entitlements });
    // The bug: with an entitlements object the gate must NOT grant every premium.
    expect(editor.isFeatureGranted('ai.review')).toBe(false);      // withheld premium → denied
    expect(editor.isFeatureGranted('pagination')).toBe(false);     // premium not granted → denied
    // a premium id the object DID grant is allowed on the core side too
    expect(editor.isFeatureGranted('ai.translate')).toBe(true);
  });
});
