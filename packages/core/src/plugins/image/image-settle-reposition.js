/**
 * image-settle-reposition.js — a "reposition now, then again next frame" helper
 * shared by the resize overlay and the action bar.
 *
 * WHY: align / properties commands relocate a figure (float shifts POSITION
 * without changing its box size, so a ResizeObserver never fires) AND reflow the
 * surrounding text on the *next* frame. A single synchronous rect read right
 * after the command can capture the pre-reflow box, leaving the overlay/bar
 * stale. Running reposition once now and once after the browser settles layout
 * pins it to the truth. Coalesces so rapid commands don't stack frames.
 *
 * `host` must expose `_reposition()`, `_settleRaf`, and a `_win()` returning the
 * relevant window (or null). Bound as a method so `this` is the host.
 */
/** The window owning the editor's wrapper doc, or null (jsdom-safe). */
export function winOf(editor) {
  return (editor && editor._wrapper && editor._wrapper.ownerDocument
    && editor._wrapper.ownerDocument.defaultView) || null;
}

export function repositionSettled(host, editor) {
  host._reposition();
  const win = winOf(editor);
  const raf = (win && win.requestAnimationFrame)
    ? win.requestAnimationFrame.bind(win)
    : (cb) => setTimeout(cb, 16);
  cancelSettle(host, editor);
  host._settleRaf = raf(() => { host._settleRaf = null; host._reposition(); });
}

/** Cancel a pending settle frame (used on re-schedule and on destroy/detach). */
export function cancelSettle(host, editor) {
  if (!host._settleRaf) return;
  const win = winOf(editor);
  const cancel = (win && win.cancelAnimationFrame)
    ? win.cancelAnimationFrame.bind(win)
    : clearTimeout;
  cancel(host._settleRaf);
  host._settleRaf = null;
}
