/**
 * react.js — the delivery-aware React wrapper (execution plan §1.5 stage 4).
 *
 * Same component contract as `openeditor-text-react`, with one structural
 * difference that changes everything about the mount effect:
 *
 *     npm wrapper:      new OpenEditor(...)          synchronous
 *     delivery wrapper: await createEditor(...)      ASYNCHRONOUS
 *
 * ─── WHY ASYNC IS THE WHOLE PROBLEM ─────────────────────────────────────────
 * A synchronous effect can destroy exactly what it created. An async one can
 * be unmounted, re-run, or have its props change WHILE the engine is still
 * downloading — and React 18 StrictMode deliberately mounts, unmounts and
 * remounts every effect in development to surface precisely this class of bug.
 *
 * Without a guard, StrictMode produces TWO editors and destroys neither, or
 * destroys the first while the second is still resolving. Both leak, and the
 * second is far more confusing because the container ends up with two editors
 * stacked in it.
 *
 * So the effect tracks a `cancelled` flag and destroys any editor that arrives
 * after teardown. The loader's own in-flight de-duplication means the two
 * StrictMode passes share ONE download, so this costs nothing extra.
 *
 * Written without JSX so the package ships with zero build-time transforms —
 * the same choice the existing wrappers make.
 */
import {
  createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { createEditor, applyLicence } from './index.js';

export const OpenEditor = forwardRef(function OpenEditor(props, ref) {
  const {
    // Delivery options.
    endpoint, licenceKey, licenseKey, version, installId, cache, fallback, plugins,
    // Editor props, matching the npm wrapper's contract exactly.
    value, onChange, onReady, onFocus, onBlur, onError, onLicenseError, onPremiumReady,
    onLoadError, onLicenceApplied,
    readOnly, theme, direction, config, className, style,
  } = props;

  const hostRef = useRef(null);
  const editorRef = useRef(null);
  // The last HTML the EDITOR reported. A `value` equal to this is an echo of
  // our own onChange — never re-set it, or the caret dies.
  const lastEmittedRef = useRef(null);
  // Surfaced so a host can render its own error UI. The loader has already
  // rendered the degraded textarea by this point (unless `fallback: false`).
  const [loadError, setLoadError] = useState(null);

  // Read inside the mount effect but deliberately NOT deps: construct-time by
  // contract, exactly as in the npm wrapper. Changing them must not refetch a
  // ~600 KB engine — use a React `key` to remount instead.
  const initialRef = useRef(null);
  initialRef.current = {
    endpoint, licenceKey, licenseKey, version, installId, cache, fallback, plugins,
    value, readOnly, theme, direction, config,
  };
  const handlersRef = useRef(null);
  handlersRef.current = {
    onChange, onReady, onFocus, onBlur, onError, onLicenseError, onPremiumReady,
    onLoadError, onLicenceApplied,
  };

  useEffect(() => {
    const init = initialRef.current;
    // ⚠️ The guard that makes async mounting safe. See the header.
    let cancelled = false;
    let editor = null;
    let detach = null;

    createEditor(hostRef.current, {
      ...(init.config || {}),
      endpoint: init.endpoint,
      ...(init.licenceKey !== undefined ? { licenceKey: init.licenceKey } : {}),
      ...(init.licenseKey !== undefined ? { licenseKey: init.licenseKey } : {}),
      ...(init.version !== undefined ? { version: init.version } : {}),
      ...(init.installId !== undefined ? { installId: init.installId } : {}),
      ...(init.cache !== undefined ? { cache: init.cache } : {}),
      ...(init.fallback !== undefined ? { fallback: init.fallback } : {}),
      ...(init.plugins !== undefined ? { plugins: init.plugins } : {}),
      ...(init.theme !== undefined ? { theme: init.theme } : {}),
      ...(init.direction !== undefined ? { direction: init.direction } : {}),
      ...(init.readOnly !== undefined ? { readonly: init.readOnly } : {}),
      ...(init.value !== undefined ? { defaultContent: init.value } : {}),
      // The loader logs otherwise; the host gets it through onLoadError below.
      onError: () => {},
    }).then((ed) => {
      // Unmounted (or StrictMode's second pass took over) while the engine was
      // still downloading. Destroy what arrived rather than leaking it into a
      // container React no longer owns.
      if (cancelled) { ed.destroy?.(); return; }

      editor = ed;
      editorRef.current = ed;
      lastEmittedRef.current = ed.getHTML();

      const emitChange = ({ html, text }) => {
        lastEmittedRef.current = html;
        const fn = handlersRef.current.onChange;
        if (fn) fn(html, { text, editor: ed });
      };
      const emitFocus = (e) => { const fn = handlersRef.current.onFocus; if (fn) fn(e); };
      const emitBlur = (e) => { const fn = handlersRef.current.onBlur; if (fn) fn(e); };
      const emitError = (p) => { const fn = handlersRef.current.onError; if (fn) fn(p); };
      const emitLicenseError = (p) => { const fn = handlersRef.current.onLicenseError; if (fn) fn(p); };
      const emitPremiumReady = (p) => { const fn = handlersRef.current.onPremiumReady; if (fn) fn(p); };

      ed.on('onChange', emitChange);
      ed.on('focus', emitFocus);
      ed.on('blur', emitBlur);
      ed.on('error', emitError);
      ed.on('licenseError', emitLicenseError);
      ed.on('premiumReady', emitPremiumReady);

      detach = () => {
        ed.off('onChange', emitChange);
        ed.off('focus', emitFocus);
        ed.off('blur', emitBlur);
        ed.off('error', emitError);
        ed.off('licenseError', emitLicenseError);
        ed.off('premiumReady', emitPremiumReady);
      };

      const ready = handlersRef.current.onReady;
      if (ready) ready(ed);
    }).catch((err) => {
      if (cancelled) return;
      setLoadError(err);
      const fn = handlersRef.current.onLoadError;
      if (fn) fn(err);
      // No rethrow: an unhandled rejection here would surface as a scary
      // console error for a case the loader already handled by rendering a
      // usable textarea.
    });

    return () => {
      cancelled = true;
      if (detach) detach();
      if (editor && !editor.isDestroyed()) editor.destroy();
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, []); // construct-time by contract — remount via a React `key`

  // Controlled-mode external sync. Guarded on editorRef because the editor may
  // not exist yet — a `value` change during download must not throw.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === undefined || value === null) return;
    if (value === lastEmittedRef.current) return;       // our own echo
    if (value === editor.getHTML()) return;             // already in sync
    editor.setHTML(value);
    lastEmittedRef.current = editor.getHTML();
  }, [value]);

  // The documented reactive props. Each no-ops until the engine has arrived;
  // the value is applied at construction, so nothing is lost by waiting.
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

  /**
   * Reactive licence key (E1) — parity with the npm wrapper, where changing
   * `licenseKey` re-verifies in place and unlocks premium without a remount.
   *
   * Under delivery a plan change may need a DIFFERENT bundle, which cannot be
   * swapped under a live document (§1.7 / R14 — losing unsaved work on the
   * customer's first paid transaction is the worst possible outcome). So
   * `onLicenceApplied` reports `reloadRequired` and the host decides when.
   *
   * The mount run is skipped: the key is already applied at construction.
   */
  const licenceMountedRef = useRef(false);
  useEffect(() => {
    if (!licenceMountedRef.current) { licenceMountedRef.current = true; return; }
    const editor = editorRef.current;
    if (!editor) return;                       // still downloading — nothing to update
    const key = licenceKey ?? licenseKey ?? null;
    applyLicence(editor, key, { endpoint, version, installId, container: hostRef.current })
      .then((result) => {
        const fn = handlersRef.current.onLicenceApplied;
        if (fn) fn(result);
      })
      .catch((err) => {
        const fn = handlersRef.current.onLoadError;
        if (fn) fn(err);
      });
  }, [licenceKey, licenseKey]);

  useImperativeHandle(ref, () => ({
    /** The live core editor — null while loading, and after unmount. */
    get editor() { return editorRef.current; },
    /** Why the engine failed to load, if it did. */
    get loadError() { return loadError; },
    getHTML: () => (editorRef.current ? editorRef.current.getHTML() : ''),
    getMarkdown: () => (editorRef.current ? editorRef.current.getMarkdown() : ''),
    focus: () => { if (editorRef.current) editorRef.current.focus(); },
  }), [loadError]);

  return createElement('div', {
    ref: hostRef,
    className,
    style,
    'data-open-editor-host': '',
  });
});

export default OpenEditor;
