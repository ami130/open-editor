/**
 * todo-list-plugin.test.js — 16.7.3: to-do list plugin lifecycle, insertion,
 * toolbar button, click-to-toggle, Ctrl/Cmd+Enter shortcut, and the
 * split-arming logic that resets a freshly-split item back to unchecked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createTodoListPlugin, insertTodoList, insertCheckedTodoList } from '../src/plugins/todo-list/todo-list-plugin.js';

let editor, plugin;
beforeEach(() => {
  editor = createTestEditor();
  plugin = createTodoListPlugin();
  plugin.install(editor);
});
afterEach(() => {
  plugin.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function setCaretInText(node, offset = 0) {
  editor.selection.set(node, offset);
}

describe('createTodoListPlugin — install/destroy', () => {
  it('registers todoList/todoListChecked commands and unregisters on destroy', () => {
    expect(editor.commands.get('todoList')).toBeTruthy();
    expect(editor.commands.get('todoListChecked')).toBeTruthy();
    plugin.destroy();
    expect(editor.commands.get('todoList')).toBeFalsy();
    expect(editor.commands.get('todoListChecked')).toBeFalsy();
  });

  it('exposes a toolbar button', () => {
    const buttons = plugin.getToolbarButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].name).toBe('todoList');
  });
});

describe('insertTodoList', () => {
  it('wraps the current plain paragraph, carrying its text into the new li', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<p>buy milk</p>';
    setCaretInText(root.querySelector('p').firstChild, 0);
    const ok = insertTodoList(editor);
    expect(ok).toBe(true);
    const li = root.querySelector('li[data-todo]');
    expect(li).toBeTruthy();
    expect(li.textContent).toBe('buy milk');
    expect(li.getAttribute('data-checked')).toBe('false');
  });

  it('adds a <br> placeholder when the block has no real content', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<p></p>';
    const p = root.querySelector('p');
    // Simulate autoformat's post-marker-strip state: an empty text node left in place.
    p.appendChild(document.createTextNode(''));
    setCaretInText(p.firstChild, 0);
    const ok = insertTodoList(editor);
    expect(ok).toBe(true);
    const li = root.querySelector('li[data-todo]');
    expect(li.querySelector('br')).toBeTruthy();
    expect(li.textContent).toBe('');
  });

  it('returns false when the caret is already inside an <li>', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul><li>x</li></ul>';
    setCaretInText(root.querySelector('li').firstChild, 0);
    expect(insertTodoList(editor)).toBe(false);
  });
});

describe('insertCheckedTodoList', () => {
  it('creates a to-do item that starts CHECKED', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<p>done thing</p>';
    setCaretInText(root.querySelector('p').firstChild, 0);
    const ok = insertCheckedTodoList(editor);
    expect(ok).toBe(true);
    const li = root.querySelector('li[data-todo]');
    expect(li.getAttribute('data-checked')).toBe('true');
    expect(li.textContent).toBe('done thing');
  });
});

describe('checkbox click-to-toggle', () => {
  function mousedownAt(li, clientX) {
    const rect = { left: 0, top: 0, width: 200, height: 20 };
    li.getBoundingClientRect = () => rect;
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: li, enumerable: true });
    Object.defineProperty(e, 'clientX', { value: clientX, enumerable: true });
    li.dispatchEvent(e);
    return e;
  }

  it('a click on the checkbox glyph area (leftmost ~20px) toggles checked state', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    const li = root.querySelector('li');
    const e = mousedownAt(li, 8); // inside the ~20px checkbox zone
    expect(e.defaultPrevented).toBe(true);
    expect(li.getAttribute('data-checked')).toBe('true');
  });

  it('a click on the text (beyond ~20px) does NOT toggle', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    const li = root.querySelector('li');
    const e = mousedownAt(li, 50);
    expect(e.defaultPrevented).toBe(false);
    expect(li.getAttribute('data-checked')).toBe('false');
  });
});

describe('onKeyDown — Ctrl/Cmd+Enter toggles the current item', () => {
  it('toggles when the caret is inside a to-do item', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    const li = root.querySelector('li');
    setCaretInText(li.firstChild, 0);
    const handled = plugin.onKeyDown({ key: 'Enter', ctrlKey: true, preventDefault() {} });
    expect(handled).toBe(true);
    expect(li.getAttribute('data-checked')).toBe('true');
  });

  it('returns false (does not consume) when NOT inside a to-do item', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<p>x</p>';
    setCaretInText(root.querySelector('p').firstChild, 0);
    const handled = plugin.onKeyDown({ key: 'Enter', ctrlKey: true, preventDefault() {} });
    expect(handled).toBe(false);
  });

  it('a plain Enter (no modifier) on a checked item arms the split-reset and does not consume the key', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="true">x</li></ul>';
    const li = root.querySelector('li');
    setCaretInText(li.firstChild, 1);
    const handled = plugin.onKeyDown({ key: 'Enter' });
    expect(handled).toBe(false); // never consumed — list Enter chain must still run
    expect(plugin._armedSplitLi).toBe(li);
  });

  // REGRESSION: a native browser Enter-split of a checked <li> clones ALL
  // its attributes (including data-checked="true") onto the new sibling —
  // a freshly split item must always start unchecked. Found live: typing
  // "[x] first item", Enter, "second item" produced a SECOND checked item.
  it('the armed split is consumed on the next input, resetting the new sibling to unchecked', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="true">first</li></ul>';
    const li = root.querySelector('li');
    setCaretInText(li.firstChild, 5);
    plugin.onKeyDown({ key: 'Enter' });
    expect(plugin._armedSplitLi).toBe(li);

    // Simulate what the browser's native Enter-split actually does: clone
    // the li (including its data-checked="true") as a new sibling.
    const clone = li.cloneNode(true);
    clone.textContent = 'second';
    li.parentNode.appendChild(clone);
    expect(clone.getAttribute('data-checked')).toBe('true'); // the naive clone, before normalization

    editor.emit('input', {});
    expect(plugin._armedSplitLi).toBeNull();
    expect(clone.getAttribute('data-checked')).toBe('false');
    expect(li.getAttribute('data-checked')).toBe('true'); // the ORIGINAL item is untouched
  });
});
