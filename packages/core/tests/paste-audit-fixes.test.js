/**
 * paste-audit-fixes.test.js — regression tests for the Phase 12 final-audit
 * findings (#2a, #2b, #4, #5, #7). Special characters are built from code
 * points so this file contains no literal invisible/typographic glyphs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { detectSource } from '../src/paste/paste-detect.js';
import { normalizeEncoding } from '../src/paste/normalize-paste.js';
import { reconstructWordLists } from '../src/paste/word-lists.js';

const CP = String.fromCharCode;
const LDQUO = CP(0x201C), RDQUO = CP(0x201D), NDASH = CP(0x2013), NBSP = CP(0x00A0);

let ed, t;
afterEach(() => { if (ed && !ed.isDestroyed()) ed.destroy(); if (t) t.remove(); });
function mk(html) { t = document.createElement('div'); document.body.appendChild(t); ed = new OpenEditor(t); ed.getEditorElement().innerHTML = html; }
function caret(node, off) { const r = document.createRange(); r.setStart(node, off); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
function paste(html, plain) { const e = new window.Event('paste', { bubbles: true, cancelable: true }); e.clipboardData = { getData: (k) => (k === 'text/html' ? (html || '') : (plain || '')) }; ed.getEditorElement().dispatchEvent(e); }
function clickKeep() { const b = Array.from(document.querySelectorAll('.oe-modal__btn')).find((x) => x.textContent.trim() === 'Keep'); if (b) b.click(); return !!b; }
const flush = () => new Promise((r) => setTimeout(r, 0));
const ctx = { editor: null };

describe('#2a — stale bookmark after DOM mutation during dialog', () => {
  it('DOM replaced (setHTML) while dialog open → does not corrupt new content', async () => {
    mk('<p>abc</p>');
    caret(ed.getEditorElement().querySelector('p').firstChild, 3);
    paste('<p>PASTED</p>', 'PASTED');
    await flush();
    ed.setHTML('<p>different</p>');
    clickKeep();
    await flush();
    const h = ed.getEditorElement().innerHTML;
    expect(h).toMatch(/different/);          // untouched content preserved
    expect(h).not.toMatch(/dif<\/p>/);       // not split into dif|PASTED|ferent
    expect(h).toMatch(/PASTED/);             // paste still landed (at end)
  });
});

describe('#2b — overlapping paste dialogs are serialized', () => {
  it('a second paste while a dialog is open is ignored', async () => {
    mk('<p>abcdef</p>');
    caret(ed.getEditorElement().querySelector('p').firstChild, 2);
    paste('<p>ONE</p>', 'ONE');
    await flush();
    caret(ed.getEditorElement().querySelector('p').firstChild, 5);
    paste('<p>TWO</p>', 'TWO');
    await flush();
    expect(document.querySelectorAll('.oe-modal').length).toBe(1);
    clickKeep();
    await flush();
    const h = ed.getEditorElement().innerHTML;
    expect(h).toMatch(/ONE/);
    expect(h).not.toMatch(/TWO/);
  });
});

describe('#4 — detectSource no longer false-positives on text/code', () => {
  it('mso-/o:p mentioned in text or code is treated as generic', () => {
    expect(detectSource('<p>target <code>mso-list:</code> here</p>')).toBe('generic');
    expect(detectSource('<pre>a mso-foo:bar b</pre>')).toBe('generic');
    expect(detectSource('<p>the mso-list: prop is Word-only</p>')).toBe('generic');
  });
  it('real Word structural markup is still detected', () => {
    expect(detectSource('<p style="mso-list:l0 level1">x</p>')).toBe('word');
    expect(detectSource('<span class="MsoNormal">x</span>')).toBe('word');
    expect(detectSource('<o:p></o:p>')).toBe('word');
  });
});

describe('#7 — normalizeEncoding leaves code untouched', () => {
  it('does NOT alter characters inside <pre>/<code>', () => {
    const codeHtml = '<pre><code>x = ' + LDQUO + 'hi' + RDQUO + ' + ' + NDASH + '</code></pre>';
    const out = normalizeEncoding(codeHtml, ctx);
    // The curly quote and en-dash survive (as char or entity) — not flattened to ASCII.
    expect(/[“]|&ldquo;/.test(out)).toBe(true);
    expect(/[–]|&ndash;/.test(out)).toBe(true);
  });
  it('DOES normalize the same characters in prose', () => {
    const out = normalizeEncoding('<p>' + LDQUO + 'hi' + RDQUO + ' ' + NDASH + ' a' + NBSP + 'b</p>', ctx);
    expect(out).toContain('"hi"');   // smart quotes → ASCII
    expect(out).toContain('- a');    // en dash → hyphen
    expect(/a[\u00A0]b/.test(out)).toBe(false); // nbsp gone
  });
});

describe('#5 — bullet-only Word paragraph does not leave an empty <li>', () => {
  const p = (level, type, text, id = 0) =>
    `<p style="mso-list:l${id} level${level} lfo1" data-oe-list-type="${type}">${text}</p>`;
  it('an empty list paragraph is dropped, real items kept', () => {
    const out = reconstructWordLists(p(1, 'ul', 'A') + p(1, 'ul', '') + p(1, 'ul', 'B'), ctx);
    expect(out).toBe('<ul><li>A</li><li>B</li></ul>'); // no empty <li></li>
  });
  it('a run that is ONLY empty paragraphs yields no list', () => {
    const out = reconstructWordLists(p(1, 'ul', '') + p(1, 'ul', ''), ctx);
    expect(out).not.toMatch(/<ul>/);
  });
});
