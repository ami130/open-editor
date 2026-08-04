/**
 * image-feedback.js — surface image quick-insert (drop/paste) errors to the USER,
 * not just to the (often unwired) `error` event channel.
 *
 * The insert dialog shows inline errors, but drop/paste have no dialog. Before
 * this, their failures only did editor.emit('error', …) — silent unless the host
 * app listened. Now they also show a toast (editor.ui.toast) when one is
 * available, so a too-big / failed / dead-end image gives visible feedback by
 * default. The 'error' event still fires for integrators who prefer to handle it.
 */

/** Show a user-visible error toast (if a toast surface exists) AND emit 'error'. */
export function imageError(editor, message, context) {
  try {
    if (editor && editor.ui && editor.ui.toast && typeof editor.ui.toast.error === 'function') {
      editor.ui.toast.error(message);
    }
  } catch { /* toast surface unavailable — the emit below still fires */ }
  if (editor && typeof editor.emit === 'function') {
    editor.emit('error', { error: new Error(message), context });
  }
}

/**
 * A sticky progress toast for an in-flight quick-insert upload (drop/paste have
 * no dialog progress bar). Returns a handle with success()/error()/close(), or a
 * no-op handle when no toast surface exists. Guarded so it never throws.
 */
export function imageProgress(editor, message, onCancel) {
  try {
    if (editor && editor.ui && editor.ui.toast && typeof editor.ui.toast.progress === 'function') {
      // The toast's × button aborts the in-flight upload (onCancel), so a slow
      // paste/drop upload can be cancelled — the dialog already had an abort.
      return editor.ui.toast.progress(message,
        typeof onCancel === 'function' ? { onClose: onCancel } : undefined);
    }
  } catch { /* fall through to the no-op */ }
  return { success() {}, error() {}, close() {}, update() {} };
}
