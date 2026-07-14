/**
 * paste-dialog.test.js — Phase 12.12: the ask-on-paste dialog + config gating.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { shouldAskOnPaste, defaultPasteAction, PASTE_ACTIONS } from '../src/paste/paste-dialog.js';

describe('shouldAskOnPaste', () => {
  it('asks for generic HTML when askBeforePasteHTML is true (default)', () => {
    expect(shouldAskOnPaste({ askBeforePasteHTML: true }, 'generic')).toBe(true);
    expect(shouldAskOnPaste({ askBeforePasteHTML: false }, 'generic')).toBe(false);
  });
  it('gates Word paste on askBeforePasteFromWord', () => {
    expect(shouldAskOnPaste({ askBeforePasteFromWord: true }, 'word')).toBe(true);
    expect(shouldAskOnPaste({ askBeforePasteFromWord: false }, 'word')).toBe(false);
  });
});

describe('defaultPasteAction', () => {
  it('defaults to keep', () => {
    expect(defaultPasteAction({}, 'generic')).toBe(PASTE_ACTIONS.KEEP);
  });
  it('honors defaultActionOnPaste', () => {
    expect(defaultPasteAction({ defaultActionOnPaste: 'only' }, 'generic')).toBe('only');
  });
  it('Word uses defaultActionOnPasteFromWord, falling back to defaultActionOnPaste', () => {
    expect(defaultPasteAction({ defaultActionOnPasteFromWord: 'text' }, 'word')).toBe('text');
    expect(defaultPasteAction({ defaultActionOnPaste: 'only', defaultActionOnPasteFromWord: null }, 'word')).toBe('only');
  });
});

// ── Full dialog flow through a real editor ───────────────────────────────────
let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target); // dialog ON by default
  editor.getEditorElement().innerHTML = '<p>seed</p>';
  const p = editor.getEditorElement().querySelector('p');
  const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
});
afterEach(() => { if (editor && !editor.isDestroyed()) editor.destroy(); if (target && target.parentNode) target.remove(); });

function pasteEvent(html, plain) {
  const e = new window.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = { getData: (t) => (t === 'text/html' ? (html || '') : (plain || '')) };
  return e;
}
// Click a dialog footer button by its visible label.
function clickModalButton(label) {
  const btns = Array.from(document.querySelectorAll('.oe-modal__btn'));
  const btn = btns.find((b) => b.textContent.trim() === label);
  if (btn) btn.click();
  return !!btn;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ask-on-paste dialog flow', () => {
  it('a rich-HTML paste opens the dialog', async () => {
    editor.getEditorElement().dispatchEvent(pasteEvent('<strong>bold</strong>', 'bold'));
    await flush();
    expect(document.querySelector('.oe-modal')).not.toBeNull();
    expect(document.querySelector('.oe-modal').textContent).toMatch(/Keep/);
  });

  it('Keep inserts the cleaned rich HTML', async () => {
    editor.getEditorElement().dispatchEvent(pasteEvent('<strong>bold</strong>', 'bold'));
    await flush();
    expect(clickModalButton('Keep')).toBe(true);
    await flush();
    expect(editor.getEditorElement().innerHTML).toMatch(/<strong>bold<\/strong>/);
  });

  it('Insert only Text strips all formatting', async () => {
    editor.getEditorElement().dispatchEvent(pasteEvent('<strong>bold</strong>', 'bold'));
    await flush();
    expect(clickModalButton('Insert only Text')).toBe(true);
    await flush();
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/<strong>/);
    expect(html).toMatch(/bold/);
  });

  it('Cancel inserts nothing', async () => {
    const before = editor.getEditorElement().innerHTML;
    editor.getEditorElement().dispatchEvent(pasteEvent('<strong>bold</strong>', 'bold'));
    await flush();
    expect(clickModalButton('Cancel')).toBe(true);
    await flush();
    expect(editor.getEditorElement().innerHTML).toBe(before); // unchanged
  });

  it('a Word paste shows the Word-specific dialog with a "Clean" option', async () => {
    editor.getEditorElement().dispatchEvent(
      pasteEvent('<p class=MsoNormal style="mso-list:none">word text</p>', 'word text'));
    await flush();
    const modal = document.querySelector('.oe-modal');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toMatch(/Clean/);       // Word variant label
    expect(modal.textContent).toMatch(/Word/);        // Word-specific title/message
  });

  it('plain-text paste does NOT open a dialog (inserts directly)', async () => {
    editor.getEditorElement().dispatchEvent(pasteEvent('', 'just text'));
    await flush();
    expect(document.querySelector('.oe-modal')).toBeNull();
    expect(editor.getEditorElement().textContent).toMatch(/just text/);
  });
});
