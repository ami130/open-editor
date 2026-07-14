/**
 * mention-detect.test.js — Phase 16.6.3 pure trigger-detection logic.
 */
import { describe, it, expect } from 'vitest';
import { detectMentionTrigger } from '../src/plugins/mentions/mention-detect.js';

function textNode(str) {
  const n = document.createTextNode(str);
  document.body.appendChild(n);
  return n;
}

describe('detectMentionTrigger', () => {
  it('detects a bare "@" at the start of text', () => {
    const n = textNode('@');
    expect(detectMentionTrigger(n, 1)).toEqual({ atIndex: 0, query: '' });
    n.remove();
  });

  it('detects "@" mid-sentence, preceded by a space', () => {
    const n = textNode('cc @ali');
    expect(detectMentionTrigger(n, 7)).toEqual({ atIndex: 3, query: 'ali' });
    n.remove();
  });

  it('does NOT trigger for an email-like "user@host" (no space before "@")', () => {
    const n = textNode('user@host');
    expect(detectMentionTrigger(n, 9)).toBeNull();
    n.remove();
  });

  it('cancels once whitespace follows the "@"', () => {
    const n = textNode('@ali ');
    expect(detectMentionTrigger(n, 5)).toBeNull();
    n.remove();
  });

  it('returns null when there is no "@" at all', () => {
    const n = textNode('hello world');
    expect(detectMentionTrigger(n, 11)).toBeNull();
    n.remove();
  });

  it('returns null for a non-text node or missing node', () => {
    const el = document.createElement('p');
    expect(detectMentionTrigger(el, 0)).toBeNull();
    expect(detectMentionTrigger(null, 0)).toBeNull();
  });

  it('uses the LATEST "@" before the caret when there are two', () => {
    const n = textNode('@a @b');
    expect(detectMentionTrigger(n, 5)).toEqual({ atIndex: 3, query: 'b' });
    n.remove();
  });
});
