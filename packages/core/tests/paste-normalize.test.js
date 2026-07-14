/**
 * paste-normalize.test.js — Phase 12.F: style→semantic promotion (12.13) and
 * structural + encoding normalization (12.7/12.8/12.3/12.11).
 */
import { describe, it, expect } from 'vitest';
import { styleToSemantic } from '../src/paste/style-to-semantic.js';
import {
  normalizeEncoding, removeEmptyInline, mergeAdjacentInline, stripInlineStyles,
  unwrapBareWrappers, normalizePaste,
} from '../src/paste/normalize-paste.js';

const ctx = { editor: null };

describe('styleToSemantic (12.13) — exceeds Jodit', () => {
  it('promotes font-weight:bold/700 → <strong>', () => {
    expect(styleToSemantic('<span style="font-weight:700">x</span>', ctx)).toMatch(/<strong>x<\/strong>/);
    expect(styleToSemantic('<span style="font-weight:bold">x</span>', ctx)).toMatch(/<strong>x<\/strong>/);
  });
  it('promotes font-style:italic → <em>', () => {
    expect(styleToSemantic('<span style="font-style:italic">x</span>', ctx)).toMatch(/<em>x<\/em>/);
  });
  it('promotes text-decoration:underline → <u> and line-through → <s>', () => {
    expect(styleToSemantic('<span style="text-decoration:underline">x</span>', ctx)).toMatch(/<u>x<\/u>/);
    expect(styleToSemantic('<span style="text-decoration:line-through">x</span>', ctx)).toMatch(/<s>x<\/s>/);
  });
  it('nests multiple formats (bold+italic → <strong><em>)', () => {
    const out = styleToSemantic('<span style="font-weight:700;font-style:italic">x</span>', ctx);
    expect(out).toMatch(/<strong><em>x<\/em><\/strong>/);
  });
  it('drops the consumed style prop but keeps unrelated ones', () => {
    const out = styleToSemantic('<span style="font-weight:700;color:red">x</span>', ctx);
    expect(out).toMatch(/<strong>/);
    expect(out).not.toMatch(/font-weight/);
    expect(out).toMatch(/color:red/); // preserved for 12.3 to decide
  });
  it('does not promote normal weight (400) or plain styles', () => {
    const out = styleToSemantic('<span style="font-weight:400;font-family:Arial">x</span>', ctx);
    expect(out).not.toMatch(/<strong>/);
  });
  it('returns empty/non-string unchanged', () => {
    expect(styleToSemantic('', ctx)).toBe('');
    expect(styleToSemantic(null, ctx)).toBe(null);
  });
});

describe('normalizeEncoding (12.11)', () => {
  it('strips BOM and zero-width chars', () => {
    expect(normalizeEncoding('a﻿b‌c‍d​e')).toBe('abcde');
  });
  it('normalizes smart quotes to ASCII', () => {
    expect(normalizeEncoding('“hi” ‘there’')).toBe('"hi" \'there\'');
  });
  it('en dash → hyphen, keeps em dash, ellipsis → ...', () => {
    expect(normalizeEncoding('a–b')).toBe('a-b');
    expect(normalizeEncoding('a—b')).toBe('a—b'); // em dash kept
    expect(normalizeEncoding('a…')).toBe('a...');
  });
  it('non-breaking space → regular space', () => {
    expect(normalizeEncoding('a b')).toBe('a b');
  });
});

describe('removeEmptyInline (12.8)', () => {
  it('removes empty inline wrappers', () => {
    expect(removeEmptyInline('<p>a<span></span>b</p>', ctx)).toBe('<p>ab</p>');
  });
  it('keeps inline wrappers that hold a <br> or media', () => {
    expect(removeEmptyInline('<p><span><br></span></p>', ctx)).toMatch(/<br>/);
  });
  it('does not remove empty BLOCK elements', () => {
    expect(removeEmptyInline('<p></p>', ctx)).toBe('<p></p>');
  });
  it('cascades: emptying a child empties its parent wrapper', () => {
    expect(removeEmptyInline('<p><strong><span></span></strong>x</p>', ctx)).toBe('<p>x</p>');
  });
});

describe('mergeAdjacentInline (12.7) — cleanliness win over Jodit', () => {
  it('merges two identical adjacent wrappers', () => {
    expect(mergeAdjacentInline('<strong>a</strong><strong>b</strong>', ctx)).toBe('<strong>ab</strong>');
  });
  it('does NOT merge different tags', () => {
    expect(mergeAdjacentInline('<strong>a</strong><em>b</em>', ctx)).toBe('<strong>a</strong><em>b</em>');
  });
  it('does NOT merge anchors with different href', () => {
    const html = '<a href="/x">a</a><a href="/y">b</a>';
    expect(mergeAdjacentInline(html, ctx)).toBe(html);
  });
  it('merges anchors with identical href', () => {
    const html = '<a href="/x">a</a><a href="/x">b</a>';
    expect(mergeAdjacentInline(html, ctx)).toBe('<a href="/x">ab</a>');
  });
  it('merges recursively inside blocks', () => {
    expect(mergeAdjacentInline('<p><em>a</em><em>b</em></p>', ctx)).toBe('<p><em>ab</em></p>');
  });
});

describe('unwrapBareWrappers (12.7b)', () => {
  it('unwraps an attribute-less span, keeping children', () => {
    expect(unwrapBareWrappers('<span><strong>x</strong></span>', ctx)).toBe('<strong>x</strong>');
  });
  it('keeps a span that still has attributes', () => {
    expect(unwrapBareWrappers('<span class="k">x</span>', ctx)).toBe('<span class="k">x</span>');
  });
  it('unwraps nested bare wrappers fully', () => {
    expect(unwrapBareWrappers('<span><font>x</font></span>', ctx)).toBe('x');
  });
});

describe('stripInlineStyles (12.3)', () => {
  it('strips style attributes by default', () => {
    expect(stripInlineStyles('<p style="color:red">x</p>', ctx)).toBe('<p>x</p>');
  });
  it('keeps styles when pasteStripStyles is false', () => {
    const keepCtx = { editor: { _config: { pasteStripStyles: false } } };
    expect(stripInlineStyles('<p style="color:red">x</p>', keepCtx)).toMatch(/style="color:red"/);
  });
});

describe('normalizePaste (full 12.F pass)', () => {
  it('runs promotion-independent passes end to end', () => {
    // encoding + strip + empty-removal + merge together
    const html = '<p style="margin:0">a‘x’<span></span><strong>b</strong><strong>c</strong></p>';
    const out = normalizePaste(html, ctx);
    expect(out).not.toMatch(/style=/);        // stripped
    expect(out).not.toMatch(/<span><\/span>/); // empty removed
    expect(out).toMatch(/<strong>bc<\/strong>/); // merged
    expect(out).toMatch(/a'x'/);              // smart quotes normalized
  });
});
