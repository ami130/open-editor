/**
 * paste-detect.test.js — Phase 12.B: source detection against the fixture corpus.
 */
import { describe, it, expect } from 'vitest';
import { detectSource, isWordHtml, isGDocsHtml } from '../src/paste/paste-detect.js';
import {
  WORD_PARAGRAPH, WORD_LIST, GDOCS_PARAGRAPH, GENERIC_PARAGRAPH, GENERIC_UNSAFE,
} from './fixtures/paste-fixtures.js';

describe('detectSource', () => {
  it('detects a Word paragraph paste', () => {
    expect(detectSource(WORD_PARAGRAPH)).toBe('word');
    expect(isWordHtml(WORD_PARAGRAPH)).toBe(true);
  });

  it('detects a Word list paste', () => {
    expect(detectSource(WORD_LIST)).toBe('word');
  });

  it('detects a Google Docs paste', () => {
    expect(detectSource(GDOCS_PARAGRAPH)).toBe('gdocs');
    expect(isGDocsHtml(GDOCS_PARAGRAPH)).toBe(true);
  });

  it('treats a normal browser paste as generic', () => {
    expect(detectSource(GENERIC_PARAGRAPH)).toBe('generic');
    expect(isWordHtml(GENERIC_PARAGRAPH)).toBe(false);
    expect(isGDocsHtml(GENERIC_PARAGRAPH)).toBe(false);
  });

  it('treats unsafe generic HTML as generic (source ≠ safety)', () => {
    expect(detectSource(GENERIC_UNSAFE)).toBe('generic');
  });

  it('returns generic for empty / non-string input', () => {
    expect(detectSource('')).toBe('generic');
    expect(detectSource(null)).toBe('generic');
    expect(detectSource(undefined)).toBe('generic');
  });

  it('Word wins over GDocs when both markers are present', () => {
    // A Word doc pasted through Docs can carry both — Word cleanup must run.
    const mixed = '<b id="docs-internal-guid-x"><p class=MsoNormal>x</p></b>';
    expect(detectSource(mixed)).toBe('word');
    expect(isGDocsHtml(mixed)).toBe(false); // GDocs check yields to Word
  });

  it('detects individual Word markers', () => {
    expect(isWordHtml('<p style="mso-list:l0">x</p>')).toBe(true);           // mso- style
    expect(isWordHtml('<!--[if gte mso 9]><xml></xml><![endif]-->')).toBe(true); // cond comment
    expect(isWordHtml('<o:p></o:p>')).toBe(true);                            // office tag
    expect(isWordHtml('<v:shape></v:shape>')).toBe(true);                    // VML
    expect(isWordHtml('<w:sdt></w:sdt>')).toBe(true);                        // word tag
    expect(isWordHtml('<span class="MsoNormal">x</span>')).toBe(true);       // Mso class
  });

  it('does not misfire on ordinary content that merely contains the word "word"', () => {
    expect(isWordHtml('<p>I typed the word word twice</p>')).toBe(false);
    expect(isWordHtml('<p>class="mso-fake-but-not-a-style"</p>')).toBe(false); // no colon → not a style
  });
});
