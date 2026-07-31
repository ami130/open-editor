/**
 * feature-manager-isgranted.test.js — Gap #2 fix (premium side).
 *
 * FeatureManager must expose isGranted() (alias of has) so ONE verified license
 * can be handed directly to the core editor as `config.entitlements` and drive
 * BOTH gating systems. Proves isGranted exists and agrees with has() everywhere.
 */
import { describe, it, expect } from 'vitest';
import { FeatureManager } from '../src/feature-manager.js';

const licenseResult = {
  valid: true,
  devHost: false,
  payload: { features: ['text.bold', 'list.bullet', 'ai.translate'] },
};

describe('FeatureManager.isGranted (Gap #2 adapter)', () => {
  const fm = new FeatureManager(licenseResult);

  it('exposes isGranted() as a function', () => {
    expect(typeof fm.isGranted).toBe('function');
  });

  it('isGranted agrees with has() for granted + withheld ids', () => {
    for (const id of ['text.bold', 'list.bullet', 'ai.translate', 'text.italic', 'ai.review', 'anything.x']) {
      expect(fm.isGranted(id)).toBe(fm.has(id));
    }
  });

  it('grants what the license granted, denies the rest', () => {
    expect(fm.isGranted('text.bold')).toBe(true);
    expect(fm.isGranted('ai.translate')).toBe(true);
    expect(fm.isGranted('text.italic')).toBe(false);
    expect(fm.isGranted('ai.review')).toBe(false);
  });

  it('dev-host grants all; invalid license grants none — via isGranted', () => {
    expect(new FeatureManager({ devHost: true }).isGranted('anything')).toBe(true);
    expect(new FeatureManager(null).isGranted('text.bold')).toBe(false);
  });
});
