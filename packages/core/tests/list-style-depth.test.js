/**
 * list-style-depth.test.js — 16.7.1: pure marker-cycling logic used by
 * indentLi to auto-vary a nested list's listStyleType by depth.
 */
import { describe, it, expect } from 'vitest';
import { listDepth, markerForDepth } from '../src/commands/list-style-depth.js';

describe('listDepth', () => {
  it('returns 1 for a top-level list', () => {
    document.body.innerHTML = '<div id="root"><ul id="a"><li>x</li></ul></div>';
    expect(listDepth(document.getElementById('a'))).toBe(1);
  });

  it('returns 2 for a list nested one level inside an li', () => {
    document.body.innerHTML =
      '<div id="root"><ul id="a"><li>x<ul id="b"><li>y</li></ul></li></ul></div>';
    expect(listDepth(document.getElementById('b'))).toBe(2);
  });

  it('returns 3 for a list nested two levels deep', () => {
    document.body.innerHTML =
      '<div><ul><li>x<ul><li>y<ul id="c"><li>z</li></ul></li></ul></li></ul></div>';
    expect(listDepth(document.getElementById('c'))).toBe(3);
  });
});

describe('markerForDepth', () => {
  it('cycles disc → circle → square for <ul>, then wraps', () => {
    expect(markerForDepth('ul', 1)).toBe('disc');
    expect(markerForDepth('ul', 2)).toBe('circle');
    expect(markerForDepth('ul', 3)).toBe('square');
    expect(markerForDepth('ul', 4)).toBe('disc'); // wraps back
  });

  it('cycles decimal → lower-alpha → lower-roman for <ol>, then wraps', () => {
    expect(markerForDepth('ol', 1)).toBe('decimal');
    expect(markerForDepth('ol', 2)).toBe('lower-alpha');
    expect(markerForDepth('ol', 3)).toBe('lower-roman');
    expect(markerForDepth('ol', 4)).toBe('decimal');
  });

  it('treats depth 0 or negative as depth 1 (defensive floor)', () => {
    expect(markerForDepth('ul', 0)).toBe('disc');
    expect(markerForDepth('ul', -5)).toBe('disc');
  });
});
