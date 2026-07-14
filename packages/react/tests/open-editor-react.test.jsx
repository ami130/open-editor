/**
 * 18.1/18.2 — the React wrapper, every trap from the deep analysis:
 * mount/destroy, StrictMode, uncontrolled + controlled (no echo loop),
 * reactive props, ref surface, plugins prop.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { StrictMode, createRef, createElement as h, useState } from 'react';
import { createTodoListPlugin } from '@open-editor-hq/core';
import { OpenEditor } from '../src/index.js';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-open-editor-host]').forEach((n) => n.remove());
});

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('mounting & teardown', () => {
  it('mounts a working editor and destroys it on unmount', async () => {
    const ref = createRef();
    const { unmount, container } = render(h(OpenEditor, { ref, value: '<p>hi</p>' }));
    await flush();
    expect(container.querySelector('.oe-editor')).toBeTruthy();
    expect(ref.current.getHTML()).toBe('<p>hi</p>');
    const inst = ref.current.editor;
    unmount();
    expect(inst.isDestroyed()).toBe(true);
    expect(container.querySelector('.oe-editor')).toBeNull();
  });

  it('StrictMode double-mount leaves exactly one live editor', async () => {
    const { container } = render(h(StrictMode, null, h(OpenEditor, { value: '<p>x</p>' })));
    await flush();
    expect(container.querySelectorAll('.oe-wrapper').length).toBe(1);
    expect(container.querySelector('.oe-editor').textContent).toContain('x');
  });
});

describe('uncontrolled + controlled value', () => {
  it('onChange reports edits with (html, { text, editor })', async () => {
    const ref = createRef();
    const onChange = vi.fn();
    render(h(OpenEditor, { ref, value: '<p>a</p>', onChange }));
    await flush();
    act(() => {
      const el = ref.current.editor.getEditorElement();
      el.innerHTML = '<p>ab</p>';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => new Promise((r) => setTimeout(r, 400))); // onChange debounce
    expect(onChange).toHaveBeenCalled();
    const [html, extra] = onChange.mock.calls.at(-1);
    expect(html).toContain('ab');
    expect(extra.text).toContain('ab');
    expect(extra.editor).toBe(ref.current.editor);
  });

  it('echoing our own onChange html back as `value` does NOT re-setHTML (no caret kill)', async () => {
    const ref = createRef();
    let latest = '';
    function Controlled() {
      const [val, setVal] = useState('<p>start</p>');
      latest = val;
      return h(OpenEditor, { ref, value: val, onChange: (html) => setVal(html) });
    }
    render(h(Controlled));
    await flush();
    const editor = ref.current.editor;
    const spy = vi.spyOn(editor, 'setHTML');
    act(() => {
      const el = editor.getEditorElement();
      el.innerHTML = '<p>start typed</p>';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(latest).toContain('typed');    // state round-tripped
    expect(spy).not.toHaveBeenCalled();   // …but never re-entered the editor
  });

  it('a genuinely external value change DOES sync in', async () => {
    const ref = createRef();
    const { rerender } = render(h(OpenEditor, { ref, value: '<p>one</p>' }));
    await flush();
    rerender(h(OpenEditor, { ref, value: '<p>two</p>' }));
    await flush();
    expect(ref.current.getHTML()).toBe('<p>two</p>');
  });
});

describe('reactive props (the documented set)', () => {
  it('readOnly, theme, direction apply live', async () => {
    const ref = createRef();
    const { rerender } = render(h(OpenEditor, { ref, value: '<p>x</p>' }));
    await flush();
    rerender(h(OpenEditor, { ref, value: '<p>x</p>', readOnly: true, theme: 'dark', direction: 'rtl' }));
    await flush();
    const editor = ref.current.editor;
    expect(editor.isReadOnly()).toBe(true);
    expect(editor.getTheme()).toBe('dark');
    expect(editor.getDirection()).toBe('rtl');
  });
});

describe('plugins prop + ref surface', () => {
  it('installs plugin factories on mount; ref exposes markdown', async () => {
    const ref = createRef();
    render(h(OpenEditor, {
      ref,
      value: '<ul data-todo-list><li data-todo data-checked="true">done</li></ul>',
      plugins: [createTodoListPlugin()],
    }));
    await flush();
    expect(ref.current.editor.plugins.get('todoList') || ref.current.editor.plugins.get('todo-list')).toBeTruthy();
    expect(ref.current.getMarkdown()).toContain('- [x] done');
  });
});
