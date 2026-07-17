/**
 * 18.3/18.4 — Vue wrapper: mount/teardown, v-model no-echo-loop, external
 * sync, reactive props, expose surface, plugins, useOpenEditor composable.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref, nextTick } from 'vue';
import { createTodoListPlugin } from 'openeditor-text';
import { OpenEditor, useOpenEditor } from '../src/index.js';

let wrapper;
afterEach(() => {
  if (wrapper) wrapper.unmount();
  wrapper = null;
  document.querySelectorAll('[data-open-editor-host]').forEach((n) => n.remove());
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('component', () => {
  it('mounts a working editor, destroys on unmount', async () => {
    wrapper = mount(OpenEditor, { props: { modelValue: '<p>hi</p>' }, attachTo: document.body });
    await nextTick();
    expect(wrapper.element.querySelector('.oe-editor')).toBeTruthy();
    const inst = wrapper.vm.editor;
    expect(inst.getHTML()).toBe('<p>hi</p>');
    wrapper.unmount();
    expect(inst.isDestroyed()).toBe(true);
    wrapper = null;
  });

  it('v-model: editor edits emit update:modelValue; echo never re-enters setHTML', async () => {
    let editor = null;
    const Host = defineComponent({
      setup() {
        const html = ref('<p>start</p>');
        return { html };
      },
      render() {
        return h(OpenEditor, {
          modelValue: this.html,
          'onUpdate:modelValue': (v) => { this.html = v; },
          onReady: (ed) => { editor = ed; },   // public contract — also tests the emit
        });
      },
    });
    wrapper = mount(Host, { attachTo: document.body });
    await nextTick();
    expect(editor).toBeTruthy();
    const spy = vi.spyOn(editor, 'setHTML');
    const el = editor.getEditorElement();
    el.innerHTML = '<p>start typed</p>';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(400); // onChange debounce
    await nextTick();
    expect(wrapper.vm.html).toContain('typed');   // v-model round-tripped
    expect(spy).not.toHaveBeenCalled();           // …without re-entering
  });

  it('external modelValue change DOES sync in', async () => {
    wrapper = mount(OpenEditor, { props: { modelValue: '<p>one</p>' }, attachTo: document.body });
    await nextTick();
    await wrapper.setProps({ modelValue: '<p>two</p>' });
    await nextTick();
    expect(wrapper.vm.getHTML()).toBe('<p>two</p>');
  });

  it('reactive readOnly/theme/direction; plugins installed; markdown via expose', async () => {
    wrapper = mount(OpenEditor, {
      props: {
        modelValue: '<ul data-todo-list><li data-todo data-checked="true">done</li></ul>',
        plugins: [createTodoListPlugin()],
      },
      attachTo: document.body,
    });
    await nextTick();
    await wrapper.setProps({ readOnly: true, theme: 'dark', direction: 'rtl' });
    await nextTick();
    const editor = wrapper.vm.editor;
    expect(editor.isReadOnly()).toBe(true);
    expect(editor.getTheme()).toBe('dark');
    expect(editor.getDirection()).toBe('rtl');
    expect(wrapper.vm.getMarkdown()).toContain('- [x] done');
  });
});

describe('useOpenEditor composable (18.4)', () => {
  it('binds an editor to a host ref with component lifecycle', async () => {
    // The composable needs the host ref before onMounted — a wrapper component
    // passes the same ref into both the div and useOpenEditor().
    const Harness = defineComponent({
      setup() {
        const host = ref(null);
        useOpenEditor(host, { config: { placeholder: 'via composable' } });
        return () => h('div', { ref: host });
      },
    });
    wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    expect(document.querySelector('.oe-editor')).toBeTruthy();
    const before = document.querySelectorAll('.oe-wrapper').length;
    expect(before).toBe(1);
    wrapper.unmount(); wrapper = null;
    expect(document.querySelector('.oe-editor')).toBeNull();
  });
});
