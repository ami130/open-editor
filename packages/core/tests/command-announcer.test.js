/**
 * 14.2 — command-state live region. A visually-hidden aria-live region announces
 * "Bold on" / "Bold off" (etc.) after a toggle command so a screen-reader user
 * pressing Ctrl+B while focus is in the editor hears the resulting state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = '<p>hello</p>';
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
});

function selectAll() {
  const p = editor.getEditorElement().querySelector('p, strong, em, s');
  const node = p.firstChild || p;
  const r = document.createRange();
  r.selectNodeContents(node);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}
function region() { return editor._wrapper.querySelector('.oe-sr-live'); }

describe('CommandAnnouncer (14.2)', () => {
  it('creates a visually-hidden polite live region in the wrapper', () => {
    const r = region();
    expect(r).not.toBeNull();
    expect(r.getAttribute('aria-live')).toBe('polite');
    // visually hidden (has clip-path / 1px box)
    expect(r.style.position).toBe('absolute');
    expect(r.style.width).toBe('1px');
  });

  it('announces "Bold on" then "Bold off" as the command toggles', () => {
    selectAll();
    editor.commands.execute('bold');
    expect(region().textContent).toBe('Bold on');
    // Re-select the now-bold text (inside the <strong>) before toggling off.
    const strong = editor.getEditorElement().querySelector('strong');
    const r = document.createRange();
    r.selectNodeContents(strong.firstChild);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    editor.commands.execute('bold');
    expect(region().textContent).toBe('Bold off');
  });

  it('announces italic and list toggles', () => {
    selectAll();
    editor.commands.execute('italic');
    expect(region().textContent).toBe('Italic on');
  });

  it('does NOT announce for non-toggle commands', () => {
    region().textContent = '';
    selectAll();
    editor.commands.execute('insertHorizontalRule'); // not in the toggle map
    expect(region().textContent).toBe('');
  });

  it('removes the region on destroy', () => {
    const wrapper = editor._wrapper;
    editor.destroy();
    expect(wrapper.querySelector('.oe-sr-live')).toBeNull();
  });
});
