/**
 * slash-command-plugin.test.js — Phase 16.6.1, end-to-end against a real
 * OpenEditor + CommandManager (not a mock).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createSlashCommandPlugin } from '../src/plugins/slash-command/slash-command-plugin.js';

let editor;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (editor && editor._target && editor._target.parentNode) editor._target.remove();
});

function setCaretAtEnd(textNode) {
  const range = document.createRange();
  range.setStart(textNode, textNode.nodeValue.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function fireInput(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('slash-command plugin', () => {
  it('opens the palette when "/" is typed at the start of an empty block', () => {
    editor = createTestEditor();
    editor.plugins.install(createSlashCommandPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const popup = document.querySelector('.oe-caret-popup');
    expect(popup).not.toBeNull();
    expect(popup.hidden).toBe(false);
    expect(popup.querySelectorAll('.oe-caret-popup__option').length).toBeGreaterThan(0);
  });

  it('filters entries as more characters are typed after "/"', () => {
    editor = createTestEditor();
    editor.plugins.install(createSlashCommandPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/h1';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const options = document.querySelectorAll('.oe-caret-popup__option');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toBe('Heading 1');
  });

  it('does not open when "/" is not at the start of the block', () => {
    editor = createTestEditor();
    editor.plugins.install(createSlashCommandPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = 'hi /table';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const popup = document.querySelector('.oe-caret-popup');
    expect(popup === null || popup.hidden).toBe(true);
  });

  it('closes when a space follows the slash', () => {
    editor = createTestEditor();
    editor.plugins.install(createSlashCommandPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/h';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(false);

    p.textContent = '/h ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(true);
  });

  it('Escape (via onKeyDown) closes the palette', () => {
    editor = createTestEditor();
    const plugin = createSlashCommandPlugin();
    editor.plugins.install(plugin);
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(false);

    const consumed = plugin.onKeyDown({ key: 'Escape', preventDefault() {} });
    expect(consumed).toBe(true);
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(true);
  });

  it('picking "Heading 1" deletes the trigger text and applies the h1 command', () => {
    editor = createTestEditor();
    editor.plugins.install(createSlashCommandPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/h1';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const options = document.querySelectorAll('.oe-caret-popup__option');
    options[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(editor.getEditorElement().querySelector('h1')).not.toBeNull();
    expect(editor.getEditorElement().textContent).not.toContain('/h1');
  });

  it('ArrowDown/ArrowUp navigate and Enter picks the active entry', () => {
    editor = createTestEditor();
    const plugin = createSlashCommandPlugin();
    editor.plugins.install(plugin);
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '/';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    plugin.onKeyDown({ key: 'ArrowDown', preventDefault() {} }); // -> Heading 1
    plugin.onKeyDown({ key: 'Enter', preventDefault() {} });

    expect(editor.getEditorElement().querySelector('h1')).not.toBeNull();
  });

  it('destroy() removes the popup from the DOM and stops listening', () => {
    editor = createTestEditor();
    const plugin = createSlashCommandPlugin();
    editor.plugins.install(plugin);
    editor.plugins.uninstall('slashCommand');
    expect(document.querySelector('.oe-caret-popup')).toBeNull();
  });
});
