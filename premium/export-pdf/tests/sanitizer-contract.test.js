/**
 * sanitizer-contract.test.js — the guard that would have caught the "styled a
 * stripped attribute / a class the editor never emits" class of bug.
 *
 * The PDF print CSS can only style what getHTML() actually emits, and getHTML()
 * runs the output sanitizer whose allowlist is the DEFINITIVE contract. Here we
 * import that REAL allowlist (a pure data Map — no DOM needed) and assert every
 * attribute/selector our print CSS keys on truly survives sanitization. If
 * someone tightens the allowlist later, these tests fail instead of the PDF
 * silently going blank.
 */
import { describe, it, expect } from 'vitest';
import { buildPrintDocument } from '../src/print-document.js';
// The real, definitive allowlist from the core sanitizer.
import { DEFAULT_TAG_WHITELIST } from '../../../packages/core/src/sanitizer/sanitizer-config.js';

const attrsFor = (tag) => new Set(DEFAULT_TAG_WHITELIST.get(tag) || []);

describe('PDF print CSS only depends on attributes/values the sanitizer keeps', () => {
  it('the media-embed <figure> label does NOT depend on data-provider (which is STRIPPED)', () => {
    // This is the exact bug from the audit: data-provider is set in the editor
    // but NOT in the figure allowlist, so getHTML() strips it → attr() is blank.
    const figAttrs = attrsFor('figure');
    expect(figAttrs.has('data-provider')).toBe(false); // proves the trap is real
    const d = buildPrintDocument('<p>x</p>');
    // therefore the label must be a STATIC string, never read the stripped attr.
    expect(d).toMatch(/oe-embed::before\s*\{[^}]*content:\s*"Embedded video"/);
    // the ::before content must not resolve the stripped attribute
    expect(d).not.toMatch(/content:[^;]*attr\(data-provider\)/);
  });

  it('figure keeps the class the embed rules key on (oe-embed survives)', () => {
    expect(attrsFor('figure').has('class')).toBe(true);
  });

  it('to-do list attributes the checkbox CSS keys on all survive', () => {
    expect(attrsFor('ul').has('data-todo-list')).toBe(true);
    expect(attrsFor('li').has('data-todo')).toBe(true);
    expect(attrsFor('li').has('data-checked')).toBe(true);
  });

  it('blockquote keeps data-bq-style + inline style (callout keys + --bq-accent)', () => {
    expect(attrsFor('blockquote').has('data-bq-style')).toBe(true);
    expect(attrsFor('blockquote').has('style')).toBe(true); // custom --bq-accent
  });

  it('bookmark anchor keeps class + id so print CSS + internal links resolve', () => {
    expect(attrsFor('a').has('class')).toBe(true);
    expect(attrsFor('a').has('id')).toBe(true);
  });

  it('table stripe custom property rides on inline style (allowlisted)', () => {
    expect(attrsFor('table').has('style')).toBe(true);
  });
});
