import { describe, it, expect } from 'vitest';
import {
  rewritePrompt, summarizePrompt, tonePrompt, lengthPrompt, QUICK_ACTIONS,
} from '../src/prompts.js';

describe('prompt builders', () => {
  it('rewrite/summarize embed the text and a return-only system rule', () => {
    const r = rewritePrompt('hello');
    expect(r.prompt).toContain('hello');
    expect(r.system).toMatch(/only/i);
    expect(summarizePrompt('abc').prompt).toContain('abc');
  });
  it('tone injects the requested tone (default professional)', () => {
    expect(tonePrompt('x', 'casual').prompt).toContain('casual');
    expect(tonePrompt('x').prompt).toContain('professional');
  });
  it('length shortens or expands', () => {
    expect(lengthPrompt('x', 'shorter').prompt).toMatch(/shorten/i);
    expect(lengthPrompt('x', 'longer').prompt).toMatch(/expand/i);
  });
  it('QUICK_ACTIONS each have an id, label, and a builder that returns {system,prompt}', () => {
    expect(QUICK_ACTIONS.length).toBeGreaterThanOrEqual(5);
    for (const a of QUICK_ACTIONS) {
      expect(a.id).toBeTruthy();
      expect(a.label).toBeTruthy();
      const built = a.build('sample');
      expect(built.prompt).toContain('sample');
      expect(typeof built.system).toBe('string');
    }
  });
});
