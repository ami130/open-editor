import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';

describe('Phase 0 — smoke test', () => {
  it('core package exports VERSION', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('VERSION follows semver format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  });
});
