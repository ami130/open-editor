/**
 * 15.8 — read-only visual treatment is DISTINCT from disabled. Read-only applies
 * BOTH oe-disabled (keeps the toolbar muted/inert) AND oe-readonly (softens the
 * content dimming so it reads as viewable, not broken). enable() clears both.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
});

describe('read-only treatment (15.8)', () => {
  it('setReadOnly(true) marks the wrapper both oe-disabled and oe-readonly', () => {
    editor.setReadOnly(true);
    const w = editor._wrapper;
    expect(w.classList.contains('oe-disabled')).toBe(true);
    expect(w.classList.contains('oe-readonly')).toBe(true);
    expect(editor.getEditorElement().getAttribute('aria-readonly')).toBe('true');
    expect(editor.getEditorElement().contentEditable).toBe('false');
  });

  it('setReadOnly(false) removes BOTH classes', () => {
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    const w = editor._wrapper;
    expect(w.classList.contains('oe-disabled')).toBe(false);
    expect(w.classList.contains('oe-readonly')).toBe(false);
    expect(editor.getEditorElement().getAttribute('aria-readonly')).toBe('false');
    expect(editor.getEditorElement().contentEditable).toBe('true');
  });

  it('constructing with readonly:true starts read-only', () => {
    const t2 = document.createElement('div');
    document.body.appendChild(t2);
    const e2 = new OpenEditor(t2, { readonly: true });
    expect(e2._wrapper.classList.contains('oe-readonly')).toBe(true);
    expect(e2.isReadOnly()).toBe(true);
    e2.destroy(); t2.remove();
  });

  it('read-only still keeps toolbar controls out of the tab order (inert)', () => {
    editor.setReadOnly(true);
    // .oe-disabled is present → the toolbar-disable path (roving tabindex → -1)
    // still applies; read-only softens only the CONTENT, not the toolbar.
    expect(editor._wrapper.classList.contains('oe-disabled')).toBe(true);
  });
});
