/**
 * @open-editor-hq/react — the official React wrapper (Phase 18.1/18.2).
 *
 * Design (see the editor repo's README, Phase 18 deep analysis):
 *  - UNCONTROLLED BY DEFAULT. `value` is initial content + external-change
 *    sync only: the wrapper skips syncs for HTML the editor itself just
 *    emitted (lastEmittedRef), so typing never re-enters setHTML and the
 *    caret never jumps — the classic wrapper trap.
 *  - StrictMode-safe: the mount effect fully creates and destroys the editor
 *    (the core's create/destroy idempotence is leak-tested 100 cycles deep).
 *  - SSR-safe to IMPORT (the core's module graph is side-effect-free);
 *    construction needs a DOM, so render this client-side.
 *  - Reactive props are ONLY: value, readOnly, theme, direction. Everything
 *    else (config, plugins, locale…) is construct-time — change via a React
 *    `key` remount, per the documented contract.
 *
 * Written without JSX so the package ships with zero build-time transforms.
 */
import {
  createElement, forwardRef, useEffect, useImperativeHandle, useRef,
} from 'react';
import { OpenEditor as OpenEditorCore } from '@open-editor-hq/core';

export const OpenEditor = forwardRef(function OpenEditor(props, ref) {
  const {
    value,
    onChange,
    onReady,
    onFocus,
    onBlur,
    onError,
    readOnly,
    theme,
    direction,
    plugins,
    config,
    className,
    style,
  } = props;

  const hostRef = useRef(null);
  const editorRef = useRef(null);
  // The last HTML the EDITOR reported. A `value` equal to this is an echo of
  // our own onChange (controlled-mode round-trip) — never re-set it, or the
  // caret dies. Only genuinely external values sync in.
  const lastEmittedRef = useRef(null);
  // Props read inside the mount effect but deliberately NOT effect deps —
  // they are construct-time by contract (changing them must not recreate).
  const initialRef = useRef(null);
  initialRef.current = { value, readOnly, theme, direction, plugins, config };
  const handlersRef = useRef(null);
  handlersRef.current = { onChange, onReady, onFocus, onBlur, onError };

  useEffect(() => {
    const init = initialRef.current;
    const editor = new OpenEditorCore(hostRef.current, {
      ...(init.config || {}),
      ...(init.theme !== undefined ? { theme: init.theme } : {}),
      ...(init.direction !== undefined ? { direction: init.direction } : {}),
      ...(init.readOnly !== undefined ? { readonly: init.readOnly } : {}),
      ...(init.value !== undefined ? { defaultContent: init.value } : {}),
    });
    editorRef.current = editor;
    lastEmittedRef.current = editor.getHTML();

    for (const plugin of init.plugins || []) editor.plugins.install(plugin);

    const emitChange = ({ html, text }) => {
      lastEmittedRef.current = html;
      const fn = handlersRef.current.onChange;
      if (fn) fn(html, { text, editor });
    };
    const emitFocus = (e) => { const fn = handlersRef.current.onFocus; if (fn) fn(e); };
    const emitBlur = (e) => { const fn = handlersRef.current.onBlur; if (fn) fn(e); };
    const emitError = (p) => { const fn = handlersRef.current.onError; if (fn) fn(p); };
    editor.on('onChange', emitChange);
    editor.on('focus', emitFocus);
    editor.on('blur', emitBlur);
    editor.on('error', emitError);

    const ready = handlersRef.current.onReady;
    if (ready) ready(editor);

    return () => {
      editor.off('onChange', emitChange);
      editor.off('focus', emitFocus);
      editor.off('blur', emitBlur);
      editor.off('error', emitError);
      if (!editor.isDestroyed()) editor.destroy();
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, []); // construct-time by contract — see reactive-prop docs

  // Controlled-mode external sync: only when `value` is a genuinely new,
  // outside-world HTML (not the echo of our own last onChange).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === undefined || value === null) return;
    if (value === lastEmittedRef.current) return;       // our own echo
    if (value === editor.getHTML()) return;             // already in sync
    editor.setHTML(value);
    lastEmittedRef.current = editor.getHTML();
  }, [value]);

  // The documented reactive props.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && readOnly !== undefined) editor.setReadOnly(!!readOnly);
  }, [readOnly]);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && theme !== undefined) editor.setTheme(theme);
  }, [theme]);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && direction !== undefined) editor.setDirection(direction);
  }, [direction]);

  useImperativeHandle(ref, () => ({
    /** The live core editor instance (null before mount / after unmount). */
    get editor() { return editorRef.current; },
    getHTML: () => (editorRef.current ? editorRef.current.getHTML() : ''),
    getMarkdown: () => (editorRef.current ? editorRef.current.getMarkdown() : ''),
    focus: () => { if (editorRef.current) editorRef.current.focus(); },
  }), []);

  return createElement('div', {
    ref: hostRef,
    className,
    style,
    'data-open-editor-host': '',
  });
});

export default OpenEditor;
