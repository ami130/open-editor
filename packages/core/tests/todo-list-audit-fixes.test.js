/**
 * todo-list-audit-fixes.test.js — deep-audit fixes for the to-do list plugin:
 *  T1 readonly bypass — checkbox click, Ctrl+Enter, and toolbar button must all
 *     refuse to toggle/insert while the editor is readonly.
 *  T2 entitlement bypass — same three paths must refuse when 'edit.todoList'
 *     is not in grantedFeatures.
 *  T3 keyboard access — the checkbox span is tabindex=0 and Enter/Space toggles it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createTodoListPlugin } from '../src/plugins/todo-list/todo-list-plugin.js';

let target, editor, plugin;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config);
  plugin = createTodoListPlugin();
  plugin.install(editor);
  return editor;
}
afterEach(() => {
  plugin && plugin.destroy();
  editor && !editor.isDestroyed() && editor.destroy();
  target && target.remove();
});

function mousedownAt(li, clientX) {
  li.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 20 });
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'target', { value: li, enumerable: true });
  Object.defineProperty(e, 'clientX', { value: clientX, enumerable: true });
  li.dispatchEvent(e);
  return e;
}

describe('T1 — readonly bypass fixed', () => {
  it('checkbox click does NOT toggle while readonly', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    editor.setReadOnly(true);
    const li = root.querySelector('li');
    mousedownAt(li, 8);
    expect(li.getAttribute('data-checked')).toBe('false');
  });

  it('Ctrl+Enter does NOT toggle while readonly', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    editor.setReadOnly(true);
    const li = root.querySelector('li');
    editor.selection.set(li.firstChild, 0);
    plugin.onKeyDown({ key: 'Enter', ctrlKey: true, preventDefault() {} });
    expect(li.getAttribute('data-checked')).toBe('false');
  });

  it('toolbar button does NOT insert a to-do list while readonly', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<p>hi</p>';
    editor.selection.set(root.querySelector('p').firstChild, 0);
    editor.setReadOnly(true);
    plugin.getToolbarButtons()[0].onClick();
    expect(root.querySelector('li[data-todo]')).toBeNull();
  });
});

describe('T2 — entitlement bypass fixed', () => {
  it('checkbox click does NOT toggle when edit.todoList is not granted', () => {
    mount({ grantedFeatures: ['text.bold'] });
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    const li = root.querySelector('li');
    mousedownAt(li, 8);
    expect(li.getAttribute('data-checked')).toBe('false');
  });

  it('checkbox click DOES toggle when edit.todoList IS granted', () => {
    mount({ grantedFeatures: ['edit.todoList'] });
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    const li = root.querySelector('li');
    mousedownAt(li, 8);
    expect(li.getAttribute('data-checked')).toBe('true');
  });

  it('toolbar button does NOT insert when not granted', () => {
    mount({ grantedFeatures: ['text.bold'] });
    const root = editor.getEditorElement();
    root.innerHTML = '<p>hi</p>';
    editor.selection.set(root.querySelector('p').firstChild, 0);
    plugin.getToolbarButtons()[0].onClick();
    expect(root.querySelector('li[data-todo]')).toBeNull();
  });
});

describe('T3 — keyboard access to the checkbox', () => {
  it('ensureCheckBox gives the box tabindex=0', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    editor.emit('input', {}); // triggers normalizeAll -> ensureCheckBox
    const box = root.querySelector('.oe-todo-check');
    expect(box.getAttribute('tabindex')).toBe('0');
  });

  it('Enter on a focused checkbox toggles it', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    editor.emit('input', {});
    const box = root.querySelector('.oe-todo-check');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: box, enumerable: true });
    box.dispatchEvent(e);
    expect(root.querySelector('li').getAttribute('data-checked')).toBe('true');
  });

  it('Space on a focused checkbox toggles it', () => {
    mount({});
    const root = editor.getEditorElement();
    root.innerHTML = '<ul data-todo-list><li data-todo data-checked="false">x</li></ul>';
    editor.emit('input', {});
    const box = root.querySelector('.oe-todo-check');
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: box, enumerable: true });
    box.dispatchEvent(e);
    expect(root.querySelector('li').getAttribute('data-checked')).toBe('true');
  });

  // T4 — re-audit finding: ensureCheckBox only set tabindex inside its
  // "box didn't exist yet" branch, so a box loaded from HTML that ALREADY
  // contained the span (legacy content saved before this fix, or any
  // third-party-authored markup) never gained a tabindex — silently
  // reverting to mouse-only. PROVEN before the fix: setHTML() with a
  // pre-built .oe-todo-check span (no tabindex) left it permanently absent.
  it('a checkbox span that already exists in loaded HTML still gets tabindex=0', () => {
    mount({});
    editor.setHTML(
      '<ul data-todo-list><li data-todo data-checked="false">'
      + '<span class="oe-todo-check" role="checkbox" contenteditable="false" aria-label="To-do"></span>x'
      + '</li></ul>'
    );
    const box = editor.getEditorElement().querySelector('.oe-todo-check');
    expect(box.getAttribute('tabindex')).toBe('0');
  });
});
