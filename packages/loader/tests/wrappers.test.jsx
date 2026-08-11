/**
 * wrappers.test.jsx — the React and Vue delivery wrappers (§1.5 stage 4).
 *
 * These tests target the ONE thing that differs from the npm wrappers: mounting
 * is ASYNCHRONOUS. A synchronous effect can destroy exactly what it created; an
 * async one can be unmounted, re-run, or have props change while the engine is
 * still downloading. Everything below is about that window.
 *
 * `createEditor` is mocked with a controllable promise so the window can be
 * held open deliberately — the real network path is proven by the Playwright
 * runs, and faking it here would prove nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, createRef } from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// Hoisted so both the mock factory and the tests can reach it.
const state = vi.hoisted(() => ({ resolvers: [], created: 0, destroyed: 0 }));

vi.mock('../src/index.js', () => ({
  createEditor: vi.fn(() => {
    state.created += 1;
    return new Promise((resolve, reject) => {
      state.resolvers.push({ resolve, reject });
    });
  }),
}));

/** A stand-in for a live core editor, tracking destruction. */
function fakeEditor(html = '<p></p>') {
  let destroyed = false;
  const listeners = new Map();
  return {
    _html: html,
    getHTML() { return this._html; },
    getMarkdown() { return ''; },
    setHTML(v) { this._html = v; },
    setReadOnly: vi.fn(),
    setTheme: vi.fn(),
    setDirection: vi.fn(),
    focus: vi.fn(),
    isDestroyed: () => destroyed,
    destroy() { destroyed = true; state.destroyed += 1; },
    on(evt, fn) { listeners.set(evt, fn); },
    off(evt) { listeners.delete(evt); },
    emit(evt, payload) { listeners.get(evt)?.(payload); },
  };
}

/** Settle the OLDEST pending createEditor promise. */
const settle = async (editor) => {
  const pending = state.resolvers.shift();
  if (!pending) throw new Error('no pending createEditor call to settle');
  pending.resolve(editor);
  await act(async () => { await Promise.resolve(); });
};

/** Same, for Vue — no React act() wrapper, and Vue needs two ticks to flush. */
const settleVue = async (editorOrError, reject = false) => {
  const pending = state.resolvers.shift();
  if (!pending) throw new Error('no pending createEditor call to settle');
  if (reject) pending.reject(editorOrError); else pending.resolve(editorOrError);
  await nextTick(); await nextTick(); await nextTick();
};

beforeEach(() => { state.resolvers = []; state.created = 0; state.destroyed = 0; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('React wrapper — async mount safety', () => {
  it('mounts the editor once the engine resolves', async () => {
    const { OpenEditor } = await import('../src/react.js');
    const ref = createRef();
    const onReady = vi.fn();
    render(createElement(OpenEditor, { ref, endpoint: 'https://api.test', onReady }));

    // Nothing exists yet — the engine is still "downloading".
    expect(ref.current.editor).toBeNull();

    const ed = fakeEditor('<p>hi</p>');
    await settle(ed);

    expect(ref.current.editor).toBe(ed);
    expect(onReady).toHaveBeenCalledWith(ed);
    expect(ref.current.getHTML()).toBe('<p>hi</p>');
  });

  it('DESTROYS an editor that arrives after unmount', async () => {
    // The core risk of async mounting: unmount happens while the ~600 KB
    // engine is still in flight. Without the cancelled guard the editor is
    // attached to a container React no longer owns, and leaks.
    const { OpenEditor } = await import('../src/react.js');
    const { unmount } = render(createElement(OpenEditor, { endpoint: 'https://api.test' }));

    unmount();
    const ed = fakeEditor();
    await settle(ed);

    expect(ed.isDestroyed()).toBe(true);
  });

  it('leaves exactly ONE live editor under StrictMode double-mounting', async () => {
    // React 18 StrictMode mounts, unmounts and remounts every effect in
    // development precisely to surface this. Two passes must not leave two
    // editors stacked in the container.
    const { OpenEditor } = await import('../src/react.js');
    const { StrictMode } = await import('react');
    render(createElement(StrictMode, null,
      createElement(OpenEditor, { endpoint: 'https://api.test' })));

    expect(state.created).toBe(2);          // both passes started a load
    const first = fakeEditor();
    const second = fakeEditor();
    await settle(first);
    await settle(second);

    // The discarded pass's editor is destroyed; the surviving one is not.
    expect(first.isDestroyed()).toBe(true);
    expect(second.isDestroyed()).toBe(false);
  });

  it('surfaces a load failure without an unhandled rejection', async () => {
    const { OpenEditor } = await import('../src/react.js');
    const onLoadError = vi.fn();
    const ref = createRef();
    render(createElement(OpenEditor, { ref, endpoint: 'https://api.test', onLoadError }));

    const err = new Error('offline');
    state.resolvers.shift().reject(err);
    await act(async () => { await Promise.resolve(); });

    expect(onLoadError).toHaveBeenCalledWith(err);
    expect(ref.current.loadError).toBe(err);
    expect(ref.current.editor).toBeNull();
  });

  it('applies a reactive prop that changed DURING the download', async () => {
    const { OpenEditor } = await import('../src/react.js');
    const { rerender } = render(
      createElement(OpenEditor, { endpoint: 'https://api.test', readOnly: false }),
    );
    // Prop flips while the engine is still in flight — must not throw.
    rerender(createElement(OpenEditor, { endpoint: 'https://api.test', readOnly: true }));

    const ed = fakeEditor();
    await settle(ed);
    // The value is applied at construction, so the editor is not stale; a
    // later change reaches it through the ordinary watcher.
    await act(async () => {
      rerender(createElement(OpenEditor, { endpoint: 'https://api.test', readOnly: false }));
    });
    expect(ed.setReadOnly).toHaveBeenCalledWith(false);
  });

  it('never re-enters setHTML for an echo of its own onChange', async () => {
    // The classic wrapper trap: syncing back the editor's own HTML kills the
    // caret. Same contract as the npm wrapper.
    const { OpenEditor } = await import('../src/react.js');
    const onChange = vi.fn();
    const { rerender } = render(
      createElement(OpenEditor, { endpoint: 'https://api.test', value: '<p>a</p>', onChange }),
    );
    const ed = fakeEditor('<p>a</p>');
    await settle(ed);

    act(() => { ed.emit('onChange', { html: '<p>typed</p>', text: 'typed' }); });
    expect(onChange).toHaveBeenCalled();

    const spy = vi.spyOn(ed, 'setHTML');
    await act(async () => {
      rerender(createElement(OpenEditor, {
        endpoint: 'https://api.test', value: '<p>typed</p>', onChange,
      }));
    });
    expect(spy).not.toHaveBeenCalled();      // it was our own echo
  });
});

describe('Vue wrapper — async mount safety', () => {
  it('mounts and emits ready once the engine resolves', async () => {
    const { OpenEditor } = await import('../src/vue.js');
    const wrapper = mount(OpenEditor, { props: { endpoint: 'https://api.test' } });

    const ed = fakeEditor('<p>hi</p>');
    await settleVue(ed);

    expect(wrapper.emitted('ready')?.[0]?.[0]).toBe(ed);
    wrapper.unmount();
  });

  it('DESTROYS an editor that arrives after unmount', async () => {
    const { OpenEditor } = await import('../src/vue.js');
    const wrapper = mount(OpenEditor, { props: { endpoint: 'https://api.test' } });
    wrapper.unmount();

    const ed = fakeEditor();
    await settleVue(ed);

    expect(ed.isDestroyed()).toBe(true);
  });

  it('emits load-error instead of throwing', async () => {
    const { OpenEditor } = await import('../src/vue.js');
    const wrapper = mount(OpenEditor, { props: { endpoint: 'https://api.test' } });

    const err = new Error('offline');
    await settleVue(err, true);

    expect(wrapper.emitted('load-error')?.[0]?.[0]).toBe(err);
    wrapper.unmount();
  });

  it('a modelValue change during the download does not throw', async () => {
    const { OpenEditor } = await import('../src/vue.js');
    const wrapper = mount(OpenEditor, {
      props: { endpoint: 'https://api.test', modelValue: '<p>a</p>' },
    });
    // The watcher fires with no editor yet — it must simply no-op.
    await wrapper.setProps({ modelValue: '<p>b</p>' });

    const ed = fakeEditor('<p>a</p>');
    await settleVue(ed);

    // Now that it exists, a genuine external change applies.
    await wrapper.setProps({ modelValue: '<p>c</p>' });
    expect(ed.getHTML()).toBe('<p>c</p>');
    wrapper.unmount();
  });
});
