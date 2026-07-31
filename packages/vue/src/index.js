/**
 * openeditor-text-vue — the official Vue 3 wrapper (Phase 18.3/18.4).
 *
 * Same design contract as the React wrapper (README, Phase 18 deep analysis):
 * uncontrolled-by-default with external-change diffing (v-model echoes of the
 * editor's own onChange never re-enter setHTML — the caret is never
 * disturbed by typing); reactive props are ONLY modelValue/readOnly/theme/
 * direction; config and plugins are construct-time (remount via :key).
 *
 * Render-function source — no SFC compiler, zero build-time transforms.
 */
import {
  defineComponent, h, ref, watch, onMounted, onBeforeUnmount, shallowRef,
} from 'vue';
import { OpenEditor as OpenEditorCore } from 'openeditor-text';

/**
 * 18.4 — Composition-API idiom: bring-your-own element.
 *   const host = ref(null);
 *   const { editor } = useOpenEditor(host, { theme: 'dark' });
 * Returns { editor } (shallowRef; null until mounted, null again after
 * unmount). Lifecycle is bound to the calling component.
 */
export function useOpenEditor(hostRef, options = {}) {
  const editor = shallowRef(null);
  onMounted(() => {
    if (!hostRef.value) return;
    editor.value = new OpenEditorCore(hostRef.value, options.config || {});
    for (const plugin of options.plugins || []) editor.value.plugins.install(plugin);
    if (options.onReady) options.onReady(editor.value);
  });
  onBeforeUnmount(() => {
    if (editor.value && !editor.value.isDestroyed()) editor.value.destroy();
    editor.value = null;
  });
  return { editor };
}

export const OpenEditor = defineComponent({
  name: 'OpenEditor',
  props: {
    modelValue: { type: String, default: undefined },
    readOnly: { type: Boolean, default: undefined },
    theme: { type: String, default: undefined },
    direction: { type: String, default: undefined },
    plugins: { type: Array, default: undefined },
    config: { type: Object, default: undefined },
    // Phase 2 — first-class licensing. licenseKey is REACTIVE (re-verifies in
    // place on change); licenseKeys is the integrator's published public key(s).
    licenseKey: { type: String, default: undefined },
    licenseKeys: { type: Array, default: undefined },
  },
  emits: ['update:modelValue', 'change', 'ready', 'focus', 'blur', 'error', 'license-error', 'premium-ready'],
  setup(props, { emit, expose }) {
    const host = ref(null);
    const editorRef = shallowRef(null);
    // The last HTML the EDITOR reported — a modelValue equal to this is the
    // echo of our own update:modelValue; syncing it back would kill the caret.
    let lastEmitted = null;

    onMounted(() => {
      const editor = new OpenEditorCore(host.value, {
        ...(props.config || {}),
        ...(props.theme !== undefined ? { theme: props.theme } : {}),
        ...(props.direction !== undefined ? { direction: props.direction } : {}),
        ...(props.readOnly !== undefined ? { readonly: props.readOnly } : {}),
        ...(props.modelValue !== undefined ? { defaultContent: props.modelValue } : {}),
        // Phase 2 — present at construct so premium verifies + unlocks on mount.
        ...(props.licenseKey !== undefined ? { licenseKey: props.licenseKey } : {}),
        ...(props.licenseKeys !== undefined ? { licenseKeys: props.licenseKeys } : {}),
      });
      editorRef.value = editor;
      lastEmitted = editor.getHTML();

      for (const plugin of props.plugins || []) editor.plugins.install(plugin);

      editor.on('onChange', ({ html, text }) => {
        lastEmitted = html;
        emit('update:modelValue', html);
        emit('change', html, { text, editor });
      });
      editor.on('focus', (e) => emit('focus', e));
      editor.on('blur', (e) => emit('blur', e));
      editor.on('error', (p) => emit('error', p));
      editor.on('licenseError', (p) => emit('license-error', p));
      editor.on('premiumReady', (p) => emit('premium-ready', p));
      emit('ready', editor);
    });

    onBeforeUnmount(() => {
      const editor = editorRef.value;
      if (editor && !editor.isDestroyed()) editor.destroy();
      editorRef.value = null;
    });

    watch(() => props.modelValue, (value) => {
      const editor = editorRef.value;
      if (!editor || value === undefined || value === null) return;
      if (value === lastEmitted) return;          // our own echo
      if (value === editor.getHTML()) return;     // already in sync
      editor.setHTML(value);
      lastEmitted = editor.getHTML();
    });
    watch(() => props.readOnly, (v) => {
      if (editorRef.value && v !== undefined) editorRef.value.setReadOnly(!!v);
    });
    watch(() => props.theme, (v) => {
      if (editorRef.value && v !== undefined) editorRef.value.setTheme(v);
    });
    watch(() => props.direction, (v) => {
      if (editorRef.value && v !== undefined) editorRef.value.setDirection(v);
    });
    // Phase 2 — reactive licensing: on a change to EITHER licenseKey OR
    // licenseKeys, re-verify in place (unlocks newly-granted premium, no
    // remount). Watching both keeps parity with the React wrapper (which lists
    // both in its effect deps) so a keyring-only rotation also re-verifies.
    // Vue's watch is not immediate → fires only on a genuine post-mount change.
    watch(() => [props.licenseKey, props.licenseKeys], () => {
      if (editorRef.value) editorRef.value.setLicenseKey(props.licenseKey ?? null, props.licenseKeys);
    });

    // Exposed as a shallowRef — Vue's expose proxy auto-unwraps refs, so
    // template refs read `vm.editor` as the instance. (Accessor getters on
    // the exposed object are NOT reliably proxied — found by the unit suite.)
    expose({
      editor: editorRef,
      getHTML: () => (editorRef.value ? editorRef.value.getHTML() : ''),
      getMarkdown: () => (editorRef.value ? editorRef.value.getMarkdown() : ''),
      focus: () => { if (editorRef.value) editorRef.value.focus(); },
    });

    return () => h('div', { ref: host, 'data-open-editor-host': '' });
  },
});

export default OpenEditor;
