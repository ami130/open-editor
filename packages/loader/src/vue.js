/**
 * vue.js — the delivery-aware Vue 3 wrapper (execution plan §1.5 stage 4).
 *
 * Same component contract as `openeditor-text-vue`, with the one structural
 * difference that governs the whole file:
 *
 *     npm wrapper:      new OpenEditor(...)          synchronous
 *     delivery wrapper: await createEditor(...)      ASYNCHRONOUS
 *
 * So the editor may not exist when a watcher fires, and the component may be
 * unmounted while the engine is still downloading. Both cases are guarded:
 * every watcher no-ops until the editor arrives, and an editor that resolves
 * after teardown is destroyed rather than left attached to a DOM node Vue has
 * already discarded.
 *
 * Render-function source — no SFC compiler, zero build-time transforms, the
 * same choice the existing wrapper makes.
 */
import {
  defineComponent, h, ref, watch, onMounted, onBeforeUnmount, shallowRef,
} from 'vue';
import { createEditor, applyLicence } from './index.js';

/** Delivery options accepted by both the component and the composable. */
const DELIVERY_PROPS = {
  endpoint: { type: String, required: true },
  licenceKey: { type: String, default: undefined },
  licenseKey: { type: String, default: undefined },
  version: { type: String, default: undefined },
  installId: { type: String, default: undefined },
  cache: { type: Boolean, default: undefined },
  fallback: { type: [Boolean, String], default: undefined },
};

/** Strip `undefined` so a prop left unset never overrides a loader default. */
function definedOnly(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Composition-API idiom: bring your own element.
 *
 *   const host = ref(null);
 *   const { editor, loadError } = useOpenEditor(host, { endpoint: '…' });
 *
 * `editor` is null until the engine has downloaded AND mounted — which, unlike
 * the npm wrapper, is not the same tick as onMounted. Guard on it.
 */
export function useOpenEditor(hostRef, options = {}) {
  const editor = shallowRef(null);
  const loadError = shallowRef(null);
  let cancelled = false;

  onMounted(() => {
    if (!hostRef.value) return;
    createEditor(hostRef.value, { ...(options.config || {}), ...definedOnly(options) })
      .then((ed) => {
        // Unmounted mid-download: destroy what arrived instead of leaking it.
        if (cancelled) { ed.destroy?.(); return; }
        editor.value = ed;
        if (options.onReady) options.onReady(ed);
      })
      .catch((err) => {
        if (cancelled) return;
        loadError.value = err;
        if (options.onLoadError) options.onLoadError(err);
      });
  });

  onBeforeUnmount(() => {
    cancelled = true;
    if (editor.value && !editor.value.isDestroyed()) editor.value.destroy();
    editor.value = null;
  });

  return { editor, loadError };
}

export const OpenEditor = defineComponent({
  name: 'OpenEditor',
  props: {
    ...DELIVERY_PROPS,
    modelValue: { type: String, default: undefined },
    readOnly: { type: Boolean, default: undefined },
    theme: { type: String, default: undefined },
    direction: { type: String, default: undefined },
    plugins: { type: [Array, String], default: undefined },
    config: { type: Object, default: undefined },
  },
  emits: [
    'update:modelValue', 'change', 'ready', 'focus', 'blur', 'error',
    'license-error', 'premium-ready',
    // Delivery-only: the engine itself could not be loaded.
    'load-error',
    // Result of a reactive licenceKey change (E1) — carries `reloadRequired`.
    'licence-applied',
  ],
  setup(props, { emit, expose }) {
    const host = ref(null);
    const editorRef = shallowRef(null);
    const loadErrorRef = shallowRef(null);
    // The last HTML the EDITOR reported — a modelValue equal to this is the
    // echo of our own update:modelValue; syncing it back would kill the caret.
    let lastEmitted = null;
    let cancelled = false;

    onMounted(() => {
      createEditor(host.value, {
        ...(props.config || {}),
        ...definedOnly({
          endpoint: props.endpoint,
          licenceKey: props.licenceKey,
          licenseKey: props.licenseKey,
          version: props.version,
          installId: props.installId,
          cache: props.cache,
          fallback: props.fallback,
          plugins: props.plugins,
          theme: props.theme,
          direction: props.direction,
          readonly: props.readOnly,
          defaultContent: props.modelValue,
        }),
        // The loader logs otherwise; the host gets it via 'load-error' below.
        onError: () => {},
      }).then((editor) => {
        if (cancelled) { editor.destroy?.(); return; }
        editorRef.value = editor;
        lastEmitted = editor.getHTML();

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
      }).catch((err) => {
        if (cancelled) return;
        loadErrorRef.value = err;
        emit('load-error', err);
      });
    });

    onBeforeUnmount(() => {
      cancelled = true;
      const editor = editorRef.value;
      if (editor && !editor.isDestroyed()) editor.destroy();
      editorRef.value = null;
    });

    // Every watcher below already had to tolerate a null editor in the npm
    // wrapper (props can change before onMounted). Here that window is wider —
    // it lasts for the whole download — but the guard is identical.
    watch(() => props.modelValue, (value) => {
      const editor = editorRef.value;
      if (!editor || value === undefined || value === null) return;
      if (value === lastEmitted) return;          // our own echo
      if (value === editor.getHTML()) return;     // already in sync
      editor.setHTML(value);
      lastEmitted = editor.getHTML();
    });
    /**
     * Reactive licence key (E1) — parity with the npm wrapper, where changing
     * it re-verifies in place and unlocks premium without a remount.
     *
     * Under delivery a PLAN change needs a different bundle, which must not be
     * swapped under a live document (§1.7 / R14). So the result carries
     * `reloadRequired` and the host chooses the moment.
     *
     * Vue's watch is not immediate, so this fires only on a genuine post-mount
     * change — the construct value is already applied.
     */
    watch(() => [props.licenceKey, props.licenseKey], () => {
      const editor = editorRef.value;
      if (!editor) return;                    // still downloading
      applyLicence(editor, props.licenceKey ?? props.licenseKey ?? null, {
        endpoint: props.endpoint, version: props.version, installId: props.installId,
        container: host.value,
      })
        .then((result) => emit('licence-applied', result))
        .catch((err) => emit('load-error', err));
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

    // Exposed as shallowRefs — Vue's expose proxy auto-unwraps refs, so a
    // template ref reads `vm.editor` as the instance. Accessor getters are NOT
    // reliably proxied (found by the npm wrapper's unit suite), so this shape
    // is deliberate rather than stylistic.
    expose({
      editor: editorRef,
      loadError: loadErrorRef,
      getHTML: () => (editorRef.value ? editorRef.value.getHTML() : ''),
      getMarkdown: () => (editorRef.value ? editorRef.value.getMarkdown() : ''),
      focus: () => { if (editorRef.value) editorRef.value.focus(); },
    });

    return () => h('div', { ref: host, 'data-open-editor-host': '' });
  },
});

export default OpenEditor;
