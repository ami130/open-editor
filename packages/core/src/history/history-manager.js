/**
 * HistoryManager — undo/redo via full HTML snapshots.
 *
 * Each snapshot captures: { html, selection }
 *   html      — full innerHTML of the editor element at that moment
 *   selection — bookmark produced by SelectionManager.save()
 *
 * Snapshot triggers:
 *   - afterCommand event  (every command, unless inside a batch)
 *   - afterBatch event    (one snapshot for the whole batch)
 *   - input event         (debounced 1500ms — collapses rapid typing)
 *   - paste event         (after a 0ms settle timeout)
 *   - Enter keydown       (bare Enter that bypasses CommandManager)
 *
 * Re-entrancy guard: _isApplying flag prevents undo/redo from
 * triggering further snapshots while restoring state.
 */

const MAX_STACK = 100;
const IDLE_MS   = 1500;
// Cap total retained HTML to bound memory on large documents. 100 snapshots of
// a 1MB doc would otherwise retain ~100MB; this caps the sum of all snapshot
// HTML lengths and drops the oldest entries until the budget is met.
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // ~5MB of HTML across the whole stack

export class HistoryManager {
  constructor(editor) {
    this._editor  = editor;
    this._stack   = [];   // array of { html, selection }
    this._index   = -1;   // pointer into _stack
    this._isApplying = false;
    this._idleTimer  = null;

    this._bindEvents();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Capture the current editor state and push it onto the stack. */
  takeSnapshot() {
    if (this._isApplying) return;
    const editor = this._editor;
    if (!editor || editor.isDestroyed()) return;

    const el = editor.getEditorElement();
    if (!el) return;

    const html      = el.innerHTML;
    const selection = editor.selection ? editor.selection.save() : null;

    this._push({ html, selection });
  }

  undo() {
    // Flush (not just cancel) any pending idle snapshot first: if the user typed
    // and pressed Ctrl+Z before the 1500ms idle timer fired, the in-flight text
    // is not yet on the stack. Cancelling alone would DISCARD it and then step
    // _index back past the pre-typing baseline — losing the edit and consuming an
    // extra history step. Flushing captures the typed text as a new top-of-stack
    // so this undo reverts exactly that edit (and redo can restore it).
    this._flushIdleSnapshot();
    if (!this.canUndo()) return;
    this._index--;
    this._applySnapshot(this._stack[this._index]);
    this._editor.emit('undo', { index: this._index });
  }

  redo() {
    this._flushIdleSnapshot();
    if (!this.canRedo()) return;
    this._index++;
    this._applySnapshot(this._stack[this._index]);
    this._editor.emit('redo', { index: this._index });
  }

  canUndo() {
    return this._index > 0;
  }

  canRedo() {
    return this._index < this._stack.length - 1;
  }

  /** Wipe the stack entirely (called by setHTML to reset history context). */
  clear() {
    this._cancelIdleSnapshot();
    this._stack = [];
    this._index = -1;
  }

  destroy() {
    this._cancelIdleSnapshot();
    this._unbindEvents();
    this._stack  = [];
    this._editor = null;
  }

  // ─── Private: stack management ───────────────────────────────────────────────

  _push(snapshot) {
    // Truncate any redo future when a new snapshot arrives after an undo.
    // This MUST happen before the dedup check: a no-net-change snapshot taken
    // after an undo (e.g. type a char then delete it, reproducing the current
    // top's HTML) still represents a new branch and must discard the stale
    // redo future, otherwise redo() would walk into an abandoned branch.
    if (this._index < this._stack.length - 1) {
      this._stack.splice(this._index + 1);
    }

    // Deduplicate: skip if top of stack is now identical HTML (no-op commands)
    if (this._index >= 0 && this._stack[this._index].html === snapshot.html) return;

    this._stack.push(snapshot);
    this._index++;

    // Drop oldest when over the count limit — adjust index to stay on the same snapshot
    if (this._stack.length > MAX_STACK) {
      this._stack.shift();
      this._index--;
    }

    // Drop oldest when over the BYTE budget. Always keep at least 2 snapshots so
    // undo remains possible even with a single huge document.
    let total = 0;
    for (const s of this._stack) total += (s.html ? s.html.length : 0);
    while (total > MAX_TOTAL_BYTES && this._stack.length > 2) {
      const removed = this._stack.shift();
      total -= (removed && removed.html ? removed.html.length : 0);
      this._index--;
    }
    if (this._index < 0) this._index = 0;
  }

  _applySnapshot(snapshot) {
    if (!snapshot) return;
    const editor = this._editor;
    if (!editor || editor.isDestroyed()) return;

    this._isApplying = true;
    try {
      editor._setRawHTML(snapshot.html);
      if (snapshot.selection && editor.selection) {
        // Focus the editor before restoring the selection — Firefox requires the
        // element to be focused for addRange() to succeed in headless/test contexts.
        const el = editor.getEditorElement();
        if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
        editor.selection.restore(snapshot.selection);
      }
    } finally {
      this._isApplying = false;
    }
  }

  // ─── Private: idle snapshot (typing collapse) ────────────────────────────────

  _scheduleIdleSnapshot() {
    if (this._isApplying) return;
    this._cancelIdleSnapshot();
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._editor && !this._editor.isDestroyed()) {
        this.takeSnapshot();
      }
    }, IDLE_MS);
  }

  _cancelIdleSnapshot() {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  // If an idle snapshot is pending, take it NOW (capturing the in-flight edit)
  // instead of discarding it. No-op when nothing is pending.
  _flushIdleSnapshot() {
    if (this._idleTimer === null) return;
    this._cancelIdleSnapshot();
    if (this._editor && !this._editor.isDestroyed()) this.takeSnapshot();
  }

  // ─── Private: event wiring ───────────────────────────────────────────────────

  _bindEvents() {
    const ed = this._editor;

    this._onAfterCommand = (e) => {
      if (this._isApplying) return;
      // undo/redo manage the stack themselves — taking a snapshot here
      // would push a duplicate and destroy the redo stack.
      if (e && (e.command === 'undo' || e.command === 'redo')) return;
      // Skip individual command snapshots while inside a batch —
      // afterBatch fires one snapshot for the whole group instead.
      if (ed.commands && ed.commands._batching) return;
      this._cancelIdleSnapshot();
      this.takeSnapshot();
    };

    this._onAfterBatch = () => {
      if (this._isApplying) return;
      this._cancelIdleSnapshot();
      this.takeSnapshot();
    };

    this._onInput = () => {
      if (this._isApplying) return;
      this._scheduleIdleSnapshot();
    };

    this._onCompositionEnd = () => {
      if (this._isApplying) return;
      // IME commit is a discrete event — snapshot immediately rather than
      // waiting for the 1500ms idle timer that the subsequent input event starts.
      this._cancelIdleSnapshot();
      this.takeSnapshot();
    };

    this._onPaste = () => {
      if (this._isApplying) return;
      // H-5 fix: register the timer with the editor BEFORE the callback can
      // run. On a 0ms timeout the callback executes in the next task — after
      // this synchronous call returns — so add(tid) always runs first.
      // Additionally guard the callback against a destroyed editor.
      const tid = setTimeout(() => {
        if (ed._timers) ed._timers.delete(tid);
        if (this._isApplying) return;
        if (ed && !ed.isDestroyed()) this.takeSnapshot();
      }, 0);
      // Register timer with editor so destroy() can cancel it.
      if (ed._timers) ed._timers.add(tid);
    };

    this._onEnter = (e) => {
      // Bare Enter (not Shift+Enter, not inside composition) that creates a
      // new block paragraph goes through _ensureParagraphMode, NOT through
      // CommandManager.  Snapshot after the browser has finished splitting.
      if (this._isApplying) return;
      if (e.key !== 'Enter' || e.shiftKey) return;
      // Check defaultPrevented inside the timeout — the shortcut handler and
      // list-enter handler run synchronously AFTER this listener fires (both
      // are wired later in _onKeyDown), so e.defaultPrevented is not yet set
      // at listener call time.  By the time the timeout fires, all synchronous
      // handlers have completed and e.defaultPrevented is authoritative.
      const tid = setTimeout(() => {
        if (ed._timers) ed._timers.delete(tid);
        if (this._isApplying) return;
        if (e.defaultPrevented) return;
        if (ed && !ed.isDestroyed()) this.takeSnapshot();
      }, 0);
      if (ed._timers) ed._timers.add(tid);
    };

    ed.on('afterCommand',    this._onAfterCommand);
    ed.on('afterBatch',      this._onAfterBatch);
    ed.on('input',           this._onInput);
    ed.on('compositionend',  this._onCompositionEnd);
    ed.on('keydown',         this._onEnter);

    // Paste: listen on the contenteditable DOM element directly.
    const el = ed.getEditorElement();
    if (el) {
      el.addEventListener('paste', this._onPaste);
      this._pasteTarget = el;
    }
  }

  _unbindEvents() {
    const ed = this._editor;
    if (!ed) return;

    ed.off('afterCommand',    this._onAfterCommand);
    ed.off('afterBatch',      this._onAfterBatch);
    ed.off('input',           this._onInput);
    ed.off('compositionend',  this._onCompositionEnd);
    ed.off('keydown',         this._onEnter);

    if (this._pasteTarget) {
      this._pasteTarget.removeEventListener('paste', this._onPaste);
      this._pasteTarget = null;
    }
  }
}
