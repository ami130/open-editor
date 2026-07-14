/**
 * paste-pipeline.test.js — Phase 12.A: the staged paste-cleanup orchestrator.
 * Pure-function tests, no editor instance needed.
 */
import { describe, it, expect } from 'vitest';
import { runPastePipeline, buildPasteStages } from '../src/paste/paste-pipeline.js';

describe('runPastePipeline', () => {
  it('runs stages in order, threading the output of each into the next', () => {
    const stages = [
      (h) => h + '-a',
      (h) => h + '-b',
      (h) => h.toUpperCase(),
    ];
    expect(runPastePipeline('x', stages)).toBe('X-A-B');
  });

  it('returns the input unchanged when there are no stages', () => {
    expect(runPastePipeline('<p>hi</p>', [])).toBe('<p>hi</p>');
  });

  it('coerces a non-string input to an empty string', () => {
    expect(runPastePipeline(null, [(h) => h + '!'])).toBe('!');
    expect(runPastePipeline(undefined, [])).toBe('');
  });

  it('skips a throwing stage and passes the prior output through', () => {
    const stages = [
      (h) => h + '1',
      () => { throw new Error('boom'); },
      (h) => h + '2',
    ];
    expect(runPastePipeline('x', stages)).toBe('x12');
  });

  it('ignores a stage that returns a non-string (keeps prior output)', () => {
    const stages = [
      (h) => h + '1',
      () => 42,        // non-string → ignored
      (h) => h + '2',
    ];
    expect(runPastePipeline('x', stages)).toBe('x12');
  });

  it('ignores non-function entries in the stage list', () => {
    const stages = [null, (h) => h + '!', undefined];
    expect(runPastePipeline('x', stages)).toBe('x!');
  });

  it('returns the input when stages is not an array', () => {
    expect(runPastePipeline('x', null)).toBe('x');
  });
});

describe('buildPasteStages (12.A)', () => {
  it('includes the sanitizer as the only stage', () => {
    const sanitize = (h) => `[clean:${h}]`;
    const stages = buildPasteStages({ sanitize });
    expect(stages).toHaveLength(1);
    expect(runPastePipeline('X', stages)).toBe('[clean:X]');
  });

  it('produces an empty stage list when no sanitize fn is given', () => {
    expect(buildPasteStages({})).toHaveLength(0);
    expect(buildPasteStages({ sanitize: 'not-a-fn' })).toHaveLength(0);
  });
});
