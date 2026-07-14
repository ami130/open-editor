/**
 * autoformat-patterns.test.js — Phase 16.6.2 pure pattern-matching logic.
 */
import { describe, it, expect } from 'vitest';
import { matchBlockPattern, matchInlinePattern } from '../src/plugins/autoformat/autoformat-patterns.js';

describe('matchBlockPattern', () => {
  it('matches "# " -> h1, "## " -> h2, "### " -> h3', () => {
    expect(matchBlockPattern('# ')).toEqual({ command: 'h1', matchLength: 2 });
    expect(matchBlockPattern('## ')).toEqual({ command: 'h2', matchLength: 3 });
    expect(matchBlockPattern('### ')).toEqual({ command: 'h3', matchLength: 4 });
  });

  it('matches "- " and "* " -> ul', () => {
    expect(matchBlockPattern('- ')).toEqual({ command: 'ul', matchLength: 2 });
    expect(matchBlockPattern('* ')).toEqual({ command: 'ul', matchLength: 2 });
  });

  it('matches "1. " -> ol', () => {
    expect(matchBlockPattern('1. ')).toEqual({ command: 'ol', matchLength: 3 });
  });

  it('matches "> " -> blockquote', () => {
    expect(matchBlockPattern('> ')).toEqual({ command: 'blockquote', matchLength: 2 });
  });

  it('matches "```" -> pre (code block)', () => {
    expect(matchBlockPattern('```')).toEqual({ command: 'pre', matchLength: 3 });
  });

  it('does not match mid-text (only whole text-before-caret counts)', () => {
    expect(matchBlockPattern('hello # ')).toBeNull();
    expect(matchBlockPattern('a- ')).toBeNull();
  });

  it('does not match "#### " (4 hashes — not a supported heading level)', () => {
    expect(matchBlockPattern('#### ')).toBeNull();
  });

  it('does not match without the trailing space/completion', () => {
    expect(matchBlockPattern('#')).toBeNull();
    expect(matchBlockPattern('-')).toBeNull();
    expect(matchBlockPattern('1.')).toBeNull();
  });

  // 16.7.3 — to-do list triggers.
  it('matches "[ ] " -> todoList, "[x] "/"[X] " -> todoListChecked', () => {
    expect(matchBlockPattern('[ ] ')).toEqual({ command: 'todoList', matchLength: 4 });
    expect(matchBlockPattern('[x] ')).toEqual({ command: 'todoListChecked', matchLength: 4 });
    expect(matchBlockPattern('[X] ')).toEqual({ command: 'todoListChecked', matchLength: 4 });
  });

  it('checks the to-do patterns BEFORE the plain bullet pattern, so "[" is never read as a literal bullet char', () => {
    // If ordering were wrong, "[ ] " could theoretically fall through oddly —
    // assert the todo command wins outright, not 'ul'.
    expect(matchBlockPattern('[ ] ').command).toBe('todoList');
  });

  it('does not match "[ ]" without the trailing space, or a malformed bracket', () => {
    expect(matchBlockPattern('[ ]')).toBeNull();
    expect(matchBlockPattern('[y] ')).toBeNull();
    expect(matchBlockPattern('[] ')).toBeNull();
  });
});

describe('matchInlinePattern', () => {
  it('matches **bold** ending at the closing marker', () => {
    const m = matchInlinePattern('**bold**');
    expect(m).not.toBeNull();
    expect(m.command).toBe('bold');
    expect(m.contentStart).toBe(2);
    expect(m.contentEnd).toBe(6); // "bold"
  });

  it('matches __bold__ (underscore variant)', () => {
    const m = matchInlinePattern('__bold__');
    expect(m.command).toBe('bold');
  });

  it('matches *italic* (single asterisk)', () => {
    const m = matchInlinePattern('*italic*');
    expect(m.command).toBe('italic');
    expect(m.contentStart).toBe(1);
    expect(m.contentEnd).toBe(7);
  });

  it('matches _italic_ (single underscore)', () => {
    const m = matchInlinePattern('_italic_');
    expect(m.command).toBe('italic');
  });

  it('matches `code`', () => {
    const m = matchInlinePattern('`code`');
    expect(m.command).toBe('inlineCode');
    expect(m.contentStart).toBe(1);
    expect(m.contentEnd).toBe(5);
  });

  it('matches text with content BEFORE the marker pair (real editing context)', () => {
    const m = matchInlinePattern('hello **world**');
    expect(m).not.toBeNull();
    expect(m.command).toBe('bold');
    expect(m.start).toBe(6);
    expect(m.end).toBe(15);
  });

  it('does NOT match "****" (empty content between markers)', () => {
    expect(matchInlinePattern('****')).toBeNull();
  });

  it('does NOT match a single unmatched marker with no opener', () => {
    expect(matchInlinePattern('just text**')).toBeNull();
    expect(matchInlinePattern('no marker here')).toBeNull();
  });

  it('prefers the double-char bold marker over misreading it as italic', () => {
    const m = matchInlinePattern('**bold**');
    expect(m.command).toBe('bold'); // not 'italic'
  });

  it('does NOT match "**" alone with nothing before it', () => {
    expect(matchInlinePattern('**')).toBeNull();
  });

  it('REGRESSION (real-browser bug): typing "**bold**" char-by-char must NOT fire italic mid-way', () => {
    // At "**bold*" (7 of 8 chars typed), a naive scan finds "*bold*" and would
    // fire italic prematurely, stranding the outer "**" — only reproducible by
    // checking every incremental prefix, exactly what live typing produces.
    const full = '**bold**';
    for (let i = 1; i < full.length; i++) {
      const partial = full.slice(0, i);
      const m = matchInlinePattern(partial);
      expect(m, `matched too early at "${partial}"`).toBeNull();
    }
    expect(matchInlinePattern(full)).toEqual({ command: 'bold', start: 0, end: 8, contentStart: 2, contentEnd: 6 });
  });

  it('REGRESSION: same char-by-char safety for "__bold__" (underscore variant)', () => {
    const full = '__bold__';
    for (let i = 1; i < full.length; i++) {
      expect(matchInlinePattern(full.slice(0, i))).toBeNull();
    }
    expect(matchInlinePattern(full).command).toBe('bold');
  });
});
