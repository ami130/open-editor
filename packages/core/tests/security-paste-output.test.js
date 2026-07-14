import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(html = '<p>hi</p>') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  // Disable the ask-on-paste dialog so these security/sync tests exercise the
  // cleanup path directly (the dialog is covered in paste-dialog.test.js).
  const editor = new OpenEditor(target, { askBeforePasteHTML: false, askBeforePasteFromWord: false });
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function cleanup(e, t) { if (e && !e.isDestroyed()) e.destroy(); if (t && t.parentNode) t.parentNode.removeChild(t); }

function makePasteEvent(htmlData, plainData) {
  const e = new window.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = {
    getData(type) {
      if (type === 'text/html') return htmlData || '';
      if (type === 'text/plain') return plainData || '';
      return '';
    },
  };
  return e;
}

describe('C2: getHTML output is sanitized', () => {
  it('strips an injected onerror img that reached the DOM directly', () => {
    const { editor, target } = makeEditor();
    // Simulate content that bypassed setHTML (e.g. drag-drop / external script)
    editor.getEditorElement().innerHTML = '<p>ok<img src=x onerror="alert(1)"></p>';
    const out = editor.getHTML();
    expect(out).not.toMatch(/onerror/i);
    expect(out).toMatch(/ok/);
    cleanup(editor, target);
  });
  it('strips a script tag from output', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>a</p><script>alert(1)</script>';
    expect(editor.getHTML()).not.toMatch(/<script/i);
    cleanup(editor, target);
  });
  it('respects sanitize:false', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const editor = new OpenEditor(target, { sanitize: false });
    editor.getEditorElement().innerHTML = '<p>x<b>y</b></p>';
    expect(editor.getHTML()).toMatch(/x/);
    cleanup(editor, target);
  });
});

describe('C1: paste is sanitized', () => {
  it('strips event handlers from pasted HTML', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.getEditorElement().dispatchEvent(makePasteEvent('<img src=x onerror="alert(1)"><b>bold</b>', 'fallback'));
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/onerror/i);
    cleanup(editor, target);
  });
  it('inserts plain text when no HTML clipboard data', () => {
    const { editor, target } = makeEditor('<p>start</p>');
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.selectNodeContents(p.firstChild); r.collapse(false);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.getEditorElement().dispatchEvent(makePasteEvent('', 'plain<script>text'));
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/plain/);
    cleanup(editor, target);
  });
});

describe('C3: insertHTML command sanitizes', () => {
  it('strips script from insertHTML', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('insertHTML', '<img src=x onerror="evil()">safe');
    expect(editor.getEditorElement().innerHTML).not.toMatch(/onerror/i);
    cleanup(editor, target);
  });
});

// The generic HTML paste path is covered above; these drive the SOURCE-SPECIFIC
// Word/GDocs cleanup branches with HOSTILE payloads to prove the sanitizer (stage
// 0) still neutralizes XSS even as source cleanup runs afterward. (Coverage gap
// flagged by the pre-Phase-15 test-quality review.)
describe('C4: hostile Word/GDocs paste is sanitized AND cleaned', () => {
  it('strips XSS from a Word payload while still cleaning mso markup', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    // Word-flavored HTML (mso-* style triggers cleanWord) carrying an onerror img + script.
    const word = '<p style="mso-list:l0 level1"><span style="mso-bidi-font-weight:normal">'
      + 'Item<img src=x onerror="alert(1)"><script>alert(2)</script></span></p>';
    editor.getEditorElement().dispatchEvent(makePasteEvent(word, 'Item'));
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/mso-/i);        // cleanup still ran
    expect(html).toMatch(/Item/);             // content preserved
    cleanup(editor, target);
  });

  it('strips XSS from a Google-Docs payload while unwrapping the guid span', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    const gdocs = '<b id="docs-internal-guid-abc"><span>Doc</span>'
      + '<img src=x onerror="steal()"></b>';
    editor.getEditorElement().dispatchEvent(makePasteEvent(gdocs, 'Doc'));
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/docs-internal-guid/i);
    expect(html).toMatch(/Doc/);
    cleanup(editor, target);
  });
});

// mXSS / DOM-clobbering vectors on the sanitizer directly.
describe('C5: sanitizer resists clobbering + srcdoc vectors', () => {
  it('strips srcdoc off a (non-embed) iframe', () => {
    const { editor, target } = makeEditor();
    editor.setHTML('<iframe srcdoc="<script>alert(1)</script>"></iframe><p>x</p>');
    const html = editor.getHTML();
    expect(html).not.toMatch(/srcdoc/i);
    expect(html).not.toMatch(/<script/i);
    cleanup(editor, target);
  });

  it('does not let a name/id-clobbered form element survive as an executable sink', () => {
    const { editor, target } = makeEditor();
    editor.setHTML('<form><input name="attributes"><button formaction="javascript:alert(1)">x</button></form><p>y</p>');
    const html = editor.getHTML();
    expect(html).not.toMatch(/formaction/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<form/i);   // form fully stripped
    cleanup(editor, target);
  });
});
