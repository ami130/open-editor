/**
 * CommandManager — central registry and execution engine for all editor commands.
 *
 * Every formatting action goes through execute(). This ensures:
 *  - selection is saved before and restored after every command (toolbar-click safety)
 *  - beforeCommand / afterCommand events fire consistently
 *  - batch() groups multiple commands into one undo step
 */
export class CommandManager {
  constructor(editor) {
    this._editor = editor;
    this._commands = new Map();
    this._batching = false;
    this._batchDepth = 0;
  }

  /**
   * Register a command descriptor.
   * descriptor: { execute(editor, ...args), isActive?(editor), isEnabled?(editor) }
   */
  register(name, descriptor) {
    if (!name || typeof descriptor.execute !== 'function') return this;
    if (this._commands.has(name)) {
      this._editor.logger && this._editor.logger.warn(
        `CommandManager: "${name}" already registered — overwriting.`
      );
    }
    this._commands.set(name, {
      execute:  descriptor.execute,
      isActive: descriptor.isActive  || null,
      isEnabled: descriptor.isEnabled || null,
      getValue: descriptor.getValue  || null,
    });
    return this;
  }

  /** Return the raw command descriptor for a given name, or undefined. */
  get(name) {
    return this._commands.get(name);
  }

  unregister(name) {
    this._commands.delete(name);
    return this;
  }

  /**
   * Execute a registered command by name.
   * Saves selection before, restores after, fires lifecycle events.
   */
  execute(name, ...args) {
    if (!this._editor || this._editor.isDestroyed()) return false;
    const cmd = this._commands.get(name);
    if (!cmd) {
      this._editor.logger && this._editor.logger.warn(
        `CommandManager: unknown command "${name}"`
      );
      return false;
    }

    if (cmd.isEnabled && !cmd.isEnabled(this._editor)) return false;
    // Readonly blocks all mutating commands. Exempt: undo/redo (restore already
    // committed states, no new mutation) and the read-only NON-mutating commands
    // selectAll + copyAsPlainText (a reader must still be able to select and copy
    // in a readonly editor). `cut` stays blocked — it mutates.
    const READONLY_EXEMPT = new Set(['undo', 'redo', 'selectAll', 'copyAsPlainText', 'showBlocks', 'accessibilityHelp']);
    if (!READONLY_EXEMPT.has(name) && this._editor.isReadOnly && this._editor.isReadOnly()) return false;

    const beforeEvent = { command: name, args, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    this._editor.emit('beforeCommand', beforeEvent);
    if (beforeEvent.defaultPrevented) return false;

    // Save selection so toolbar clicks don't lose cursor.
    // Also save a raw range snapshot so inline-toggle commands (bold, italic,
    // strikethrough, etc.) can re-select the same range after execCommand —
    // browsers collapse the selection after execCommand on some builds.
    const bookmark = this._editor.selection ? this._editor.selection.save() : null;
    const sel = this._editor.selection;
    const win = (sel && typeof sel.getWindow === 'function') ? sel.getWindow() : null;
    const nativeSel = win && win.getSelection ? win.getSelection() : null;
    const preRange = (nativeSel && nativeSel.rangeCount > 0 && !nativeSel.isCollapsed)
      ? nativeSel.getRangeAt(0).cloneRange()
      : null;

    // 1.10: when debug is on, log every command execution (not just events).
    this._editor.logger && this._editor.logger.info('command:', name, ...args);

    let ok = false;
    let skipRestore = false;
    try {
      // Commands may return SKIP_RESTORE to signal they placed the cursor themselves
      const result = cmd.execute(this._editor, ...args);
      if (result === CommandManager.SKIP_RESTORE) skipRestore = true;
      ok = true;
    } catch (err) {
      this._editor.logger && this._editor.logger.error(
        `CommandManager: error in "${name}"`, err
      );
      this._editor.emit('error', { error: err, context: `command:${name}` });
    }

    if (skipRestore) {
      // Command placed its own cursor. For inline-style commands (bold, italic,
      // strikethrough, etc.) that only add/remove spans without restructuring
      // blocks, restore the pre-command range so the selection stays visible.
      //
      // Safety check: only restore preRange when the selection is currently
      // outside the editor (the command lost it) OR collapsed (the command
      // placed a caret but the user had a range selected). If the post-command
      // selection is already a non-collapsed range inside the editor, the
      // command handled it correctly — don't touch it.
      if (preRange && win && nativeSel) {
        const postSel = win.getSelection();
        if (postSel && postSel.isCollapsed && this._editor.getEditorElement) {
          const editorEl = this._editor.getEditorElement();
          const anchorIn = postSel.anchorNode &&
            editorEl && editorEl.contains(postSel.anchorNode);
          // Only restore preRange if cursor escaped the editor entirely.
          // If the cursor is already inside the editor (placed by the command)
          // leave it alone — restoring a preRange that pointed into now-moved
          // DOM nodes causes the browser to snap to a wrong ancestor element.
          if (!anchorIn) {
            try {
              postSel.removeAllRanges();
              postSel.addRange(preRange);
            } catch { /* stale range — ignore */ }
          }
        }
      }
    } else if (bookmark && this._editor.selection) {
      // Non-SKIP_RESTORE command: restore the saved path-based bookmark.
      this._editor.selection.restore(bookmark);
    }

    if (ok) {
      this._editor.emit('afterCommand', { command: name, args });
    }

    return ok;
  }

  isActive(name) {
    if (!this._editor || this._editor.isDestroyed()) return false;
    const cmd = this._commands.get(name);
    if (!cmd || !cmd.isActive) return false;
    try { return !!cmd.isActive(this._editor); } catch { return false; }
  }

  isEnabled(name) {
    if (!this._editor || this._editor.isDestroyed()) return false;
    const cmd = this._commands.get(name);
    if (!cmd) return false;
    if (!cmd.isEnabled) return true;
    try { return !!cmd.isEnabled(this._editor); } catch { return false; }
  }

  getAll() {
    return new Map(this._commands);
  }

  /**
   * Group multiple commands into one logical batch for history.
   * Phase 5 History will use _batching flag to collapse to one snapshot.
   */
  batch(fn) {
    if (typeof fn !== 'function') return;
    this._batching = true;
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0) {
        this._batching = false;
        if (this._editor) this._editor.emit('afterBatch');
      }
    }
  }

  destroy() {
    this._commands.clear();
    this._editor = null;
  }
}

/** Return this from a command's execute() to tell CommandManager not to restore the bookmark. */
CommandManager.SKIP_RESTORE = Symbol('SKIP_RESTORE');
