import { handleListTab, handleListEnter } from './commands/list-commands.js';
import { handleBlockquoteEnter } from './commands/block-commands.js';
import {
  handleEnterSplit, handleBackspace, handleDelete, handleMultiBlockDelete,
  ensureEditorFloor,
} from './editing/block-editing.js';
import { pruneFormatHusks } from './editing/prune-format-husks.js';

export const editorEventsMixin = {

  // ─── DOM event wiring ────────────────────────────────────────────────────────

  _attachEvents() {
    const el = this._editorEl;

    const bind = (target, type, fn) => {
      target.addEventListener(type, fn);
      this._boundHandlers[type] = this._boundHandlers[type] || [];
      this._boundHandlers[type].push({ target, fn });
    };

    bind(el, 'focus',             (e) => this._onFocus(e));
    bind(el, 'blur',              (e) => this._onBlur(e));
    bind(el, 'mousedown',         (e) => this._onMouseDown(e));
    bind(el, 'mouseup',           (e) => this._onMouseUp(e));
    bind(el, 'keydown',           (e) => this._onKeyDown(e));
    bind(el, 'keyup',             (e) => this._onKeyUp(e));
    bind(el, 'input',             (e) => this._onInput(e));
    bind(el, 'beforeinput',       (e) => this._onBeforeInput(e));
    bind(el, 'compositionstart',  (e) => this._onCompositionStart(e));
    bind(el, 'compositionupdate', (e) => this._onCompositionUpdate(e));
    bind(el, 'compositionend',    (e) => this._onCompositionEnd(e));
    bind(el, 'paste',             (e) => this._onPaste(e));
    bind(el, 'contextmenu',       (e) => this._onContextMenu(e));

    const selDoc = this._iframeDoc || document;
    bind(selDoc, 'selectionchange', () => this._onSelectionChange());

    // 16.5.3 — opt-in dirty guard: warn before the tab closes on unsaved edits.
    // Bound to window and tracked in _boundHandlers so destroy() removes it.
    if (this._config.warnOnUnload && typeof window !== 'undefined') {
      bind(window, 'beforeunload', (e) => this._onBeforeUnload(e));
    }

    // Phase 14 — touch / mobile handlers (long-press menu, vkbd scroll, drop
    // change-notify, iOS touchend read). Lives in editor-mobile.js.
    if (typeof this._attachMobileEvents === 'function') this._attachMobileEvents();
  },

  _onFocus(e) {
    this._state.isFocused = true;
    this.logger.info('focus');
    this.emit('focus', e);
  },

  _onBlur(e) {
    this._state.isFocused = false;
    this.logger.info('blur');
    this.emit('blur', e);
  },

  _onMouseDown(e) { this.emit('mousedown', e); },
  _onMouseUp(e)   { this.emit('mouseup', e); },

  _onKeyDown(e) {
    this.logger.info('keydown', e.key);
    this.emit('keydown', e);

    if (e.defaultPrevented) return;

    // 12.10 — Ctrl+Shift+V (Cmd+Shift+V on mac): arm a one-shot "paste as plain
    // text" request for the paste event the browser is about to fire. We do NOT
    // preventDefault — the native paste must still happen so _onPaste runs and
    // consumes the flag. Not registered as a normal shortcut precisely because
    // a matched shortcut preventDefaults and would swallow the paste.
    // Armed as a TIMESTAMP (not a sticky boolean): _onPaste only honors it for a
    // paste that follows within a short window, so pressing the chord and then
    // NOT pasting (e.g. hitting Escape) can't make a much-later normal Ctrl+V
    // paste plain unexpectedly.
    if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      this._forcePlainPasteAt = Date.now();
      return;
    }

    // READ-ONLY guard for PLUGIN mutation. The editable element is
    // contenteditable=false in readonly (browser blocks native typing), but a
    // plugin's onKeyDown (table Tab adds a row, code-block Tab inserts spaces)
    // mutates the DOM programmatically regardless — so skip plugin dispatch when
    // readonly. The shortcut→CommandManager path below is checked separately and
    // already lets read-only-exempt commands (undo/redo/selectAll) through while
    // blocking formatting, and the block-editing handlers are guarded further down.
    const readOnly = !!(this._state && this._state.isReadOnly);

    // 8.6 — plugins may intercept keydown by returning true from onKeyDown(e).
    if (this.plugins && !this._isComposing && !readOnly) {
      for (const plugin of this.plugins._installed.values()) {
        if (typeof plugin.onKeyDown === 'function') {
          try { if (plugin.onKeyDown(e)) { e.preventDefault(); return; } }
          catch { /* plugin error must not kill keydown handling */ }
        }
      }
    }

    if (!this._isComposing) {
      const descriptor = this.shortcuts.match(e);
      if (descriptor) {
        this.logger.info('shortcut matched:', descriptor.command);
        this.emit('shortcut', descriptor, e);
        e.preventDefault();
        return;
      }
    }

    // 2.13 — maxLength enforcement
    if (!this._isComposing && this._config.maxLength != null) {
      // Non-additive keys: navigation, modifiers, control keys, function keys.
      // PageUp/PageDown/Insert also listed (H-2 fix: complete non-additive set).
      const additive = !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
                         'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab',
                         'Escape', 'Enter', 'Shift', 'Control', 'Alt', 'AltGraph',
                         'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause',
                         'PageUp', 'PageDown', 'Insert', 'PrintScreen',
                         'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
                         'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key);
      const isShortcut = e.ctrlKey || e.metaKey || e.altKey;
      const selInfo = this.selection && this.selection.get();
      const selCollapsed = !selInfo || selInfo.collapsed !== false;
      if (additive && !isShortcut && selCollapsed && this._rawTextLength() >= this._config.maxLength) {
        e.preventDefault();
        this.emit('maxLengthExceeded', { current: this._rawTextLength(), max: this._config.maxLength });
        return;
      }
    }

    // Block-editing handlers mutate the DOM programmatically — skip them all in
    // readonly (contenteditable=false already blocks the browser's own editing).
    if (!this._isComposing && !readOnly && e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault();
        this._enterHandled = true;
        this._insertBR();
      } else {
        if (handleBlockquoteEnter(this)) {
          e.preventDefault();
          this._enterHandled = true;
          this.emit('afterCommand', { command: 'blockquoteEnter', args: [] });
        } else if (handleListEnter(this)) {
          e.preventDefault();
          this._enterHandled = true;
          this.emit('afterCommand', { command: 'listEnter', args: [] });
        } else if (handleEnterSplit(this)) {
          e.preventDefault();
          this._enterHandled = true;
        } else {
          this._enterHandled = false;
          const tid = setTimeout(() => {
            this._timers.delete(tid);
            if (!this._destroyed) this._ensureParagraphMode();
          }, 0);
          this._timers.add(tid);
        }
      }
    }

    if (!this._isComposing && !readOnly && e.key === 'Backspace') {
      if (handleMultiBlockDelete(this)) { e.preventDefault(); return; }
      if (handleBackspace(this))        { e.preventDefault(); return; }
    }

    if (!this._isComposing && !readOnly && e.key === 'Delete') {
      if (handleMultiBlockDelete(this)) { e.preventDefault(); return; }
      if (handleDelete(this))           { e.preventDefault(); return; }
    }

    // 17.5.6-found Firefox bug: OVERTYPING a selection that Firefox anchors at
    // the EDITOR ROOT (its select-all does this) let the browser delete every
    // block and then type into the bare root — one new <p> per keystroke burst
    // (select-all → type = shredded document). Two cases, no preventDefault —
    // the typed character inserts natively into the surviving valid block:
    //  • multi-block selection → same merge as Backspace/Delete;
    //  • root-anchored selection (getParentBlock = null, so the merge bails) →
    //    delete the contents ourselves and restore the <p><br></p> floor.
    if (!this._isComposing && !readOnly
        && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!handleMultiBlockDelete(this)) {
        const info = this.selection && this.selection.get();
        const root = this.getEditorElement();
        if (info && !info.collapsed
            && (info.startNode === root || info.endNode === root)) {
          info.range.deleteContents();
          ensureEditorFloor(this);
        }
      }
    }

    if (e.key === 'Tab' && !readOnly) {
      if (!this._isComposing && handleListTab(this, e.shiftKey)) {
        e.preventDefault();
        this.emit('afterCommand', { command: e.shiftKey ? 'outdent' : 'indent', args: [] });
      }
      // Tab outside a list: allow browser default (focus moves to next element)
    }
  },

  _onKeyUp(e) { this.emit('keyup', e); },

  _onBeforeInput(e) {
    if (this._config.maxLength != null && !this._isComposing) {
      const additive = e.inputType && (
        e.inputType.startsWith('insert') || e.inputType === 'historyRedo'
      );
      const selInfo = this.selection && this.selection.get();
      const selCollapsed = !selInfo || selInfo.collapsed !== false;
      if (additive && selCollapsed && this._rawTextLength() >= this._config.maxLength) {
        e.preventDefault();
        this.emit('maxLengthExceeded', { current: this._rawTextLength(), max: this._config.maxLength });
        return;
      }
    }
    // Firefox fires beforeinput with insertParagraph even after keydown
    // e.preventDefault() was called. Guard with _enterHandled flag so we only
    // suppress when our keydown handler already split the block.
    if (!this._isComposing && e.inputType === 'insertParagraph' && this._enterHandled) {
      e.preventDefault();
      this._enterHandled = false;
      return;
    }
    this.emit('beforeinput', e);

    // 16.A4 — cancelable content-change hook. beforeinput is the ONLY point
    // where a change can be truthfully vetoed (the browser has not yet mutated
    // the DOM). preventDefault() on our synthetic event cancels the native input.
    if (!this._isComposing) {
      const changeEvent = { inputType: e.inputType, data: e.data,
        defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      this.emit('beforeChange', changeEvent);
      if (changeEvent.defaultPrevented) { e.preventDefault(); return; }
    }
  },

  _onInput(e) {
    this._updatePlaceholder();
    this.emit('input', e);
    // Wrap any bare text node the browser dropped directly into the editor root.
    // This happens on the very first keystroke in a fresh editor — the browser
    // puts text as a raw text node child of the contenteditable div instead of
    // inside a <p>. All commands (blockquote, indent, UL/OL, etc.) need a block
    // wrapper to operate on, so we normalise here on every input event.
    // Skip during IME composition (compositionend handles that case) and during
    // programmatic setHTML calls.
    if (!this._isSettingHTML && !this._isComposing) {
      this._ensureParagraphMode();
      ensureEditorFloor(this);
    }
    if (!this._isSettingHTML && !this._isComposing && this._onChangeFn) {
      this._onChangeFn();
    }
  },

  _onCompositionStart(e) {
    this._isComposing = true;
    // H1 fix: snapshot the live DOM before the IME commits, so a readonly
    // editor can restore EXACTLY what was there (independent of _state.html,
    // which is the sanitized getHTML() output and is '' for a readonly editor
    // created with defaultContent — restoring it would wipe the content).
    if (this._state && this._state.isReadOnly && this._editorEl) {
      this._preCompositionHTML = this._editorEl.innerHTML;
    }
    this.logger.info('compositionstart');
    this.emit('compositionstart', e);
  },

  _onCompositionUpdate(e) { this.emit('compositionupdate', e); },

  _onCompositionEnd(e) {
    this._isComposing = false;
    this.logger.info('compositionend');
    // H-3: readonly editors must not retain IME-committed text. If the editor
    // is readonly, undo the composition by restoring the last known HTML state
    // and bail out before taking any snapshot or firing onChange.
    if (this._state && this._state.isReadOnly) {
      // Restore the pre-composition DOM captured at compositionstart. Fall back
      // to _state.html only if we somehow never captured one.
      const restore = this._preCompositionHTML != null
        ? this._preCompositionHTML
        : (this._state.html != null ? this._state.html : null);
      if (restore != null && this._editorEl) {
        this._editorEl.innerHTML = restore;
      }
      this._preCompositionHTML = null;
      this.emit('compositionend', e);
      return;
    }
    // Normalize the DOM BEFORE emitting 'compositionend' so the history
    // handler (which snapshots on that event) captures the normalized markup
    // rather than the raw IME-committed structure.
    try {
      this._ensureParagraphMode();
    } catch { /* don't let normalization failure suppress the event (M-20 fix) */ }
    // maxLength is suppressed during composition (the gate skips while
    // _isComposing); enforce it now that the IME has committed.
    this._truncateToMaxLength();
    this.emit('compositionend', e);
    this._updatePlaceholder();
    if (!this._isSettingHTML && this._onChangeFn) this._onChangeFn();
  },

  _onContextMenu(e) { this.emit('contextmenu', e); },

  // _onPaste / _escapeText live in editor-paste.js (300-line limit).

  _onSelectionChange() {
    if (!this.selection) return;
    const sel = this.selection.get();
    if (!sel) return;
    // LOW fix: drop stale pending-format husks the caret has moved away from,
    // keeping the one it currently sits in. Cheap and keeps the live DOM clean.
    if (this._editorEl) pruneFormatHusks(this._editorEl, sel.startNode);
    this.emit('selectionChange', sel);
  },
};
