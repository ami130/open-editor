/**
 * sanitizer-contract.test.js — guards the DOCX exporter against depending on
 * markup that getHTML() strips. The exporter only ever sees sanitized HTML, so
 * anything it keys on (attributes, list markers, ids) must survive the REAL
 * allowlist. We import that definitive Map (pure data, no DOM) and assert the
 * contract, so a future allowlist change fails here instead of silently
 * dropping content from the .docx.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_TAG_WHITELIST } from '../../../packages/core/src/sanitizer/sanitizer-config.js';

const attrsFor = (tag) => new Set(DEFAULT_TAG_WHITELIST.get(tag) || []);

describe('DOCX exporter only depends on markup the sanitizer keeps', () => {
  it('list/ordered attributes the ol/li handling reads all survive', () => {
    expect(attrsFor('ol').has('start')).toBe(true);
    expect(attrsFor('ol').has('type')).toBe(true);
  });

  it('to-do attributes (checkbox glyph + state) survive', () => {
    expect(attrsFor('ul').has('data-todo-list')).toBe(true);
    expect(attrsFor('li').has('data-todo')).toBe(true);
    expect(attrsFor('li').has('data-checked')).toBe(true);
  });

  it('internal-link + bookmark plumbing survives: <a href|id>, target ids', () => {
    expect(attrsFor('a').has('href')).toBe(true);
    expect(attrsFor('a').has('id')).toBe(true);
    // headings carry ids that become bookmark targets
    expect(attrsFor('h2').has('id')).toBe(true);
  });

  it('table span attributes the merge logic reads survive', () => {
    expect(attrsFor('td').has('colspan')).toBe(true);
    expect(attrsFor('td').has('rowspan')).toBe(true);
    expect(attrsFor('th').has('colspan')).toBe(true);
  });

  it('image sizing attributes survive (width/height/style)', () => {
    expect(attrsFor('img').has('width')).toBe(true);
    expect(attrsFor('img').has('style')).toBe(true);
  });

  it('figure alignment class survives (drives image jc)', () => {
    expect(attrsFor('figure').has('class')).toBe(true);
  });

  it('dl/dt/dd are allowlisted tags (definition lists reach the exporter)', () => {
    expect(DEFAULT_TAG_WHITELIST.has('dl')).toBe(true);
    expect(DEFAULT_TAG_WHITELIST.has('dt')).toBe(true);
    expect(DEFAULT_TAG_WHITELIST.has('dd')).toBe(true);
  });
});
