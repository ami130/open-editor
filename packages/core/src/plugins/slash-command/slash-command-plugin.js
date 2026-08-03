/**
 * slash-command-plugin.js — Phase 16.6.1: typing "/" at the start of an empty
 * block opens a searchable command palette (core commands only — see
 * slash-command-data.js for scope).
 *
 * Trigger detection is a pure function (slash-detect.js) run on every `input`;
 * the popup itself is the shared caret-anchored primitive (caret-popup.js).
 * Picking an entry deletes the "/query" text, then runs the command through
 * the normal command layer (undo/redo, beforeCommand/afterCommand all fire
 * exactly as a toolbar click would).
 *
 * Implements { name, install, destroy }.
 */
import { createCaretPopup } from '../../ui/caret-popup.js';
import { injectCaretPopupStyles } from '../../ui/caret-popup-styles.js';
import { getParentBlock } from '../../selection/range-utils.js';
import { detectSlashTrigger } from './slash-detect.js';
import { filterSlashCommands } from './slash-command-data.js';
import { featureForCommand } from '../../entitlements/feature-catalog.js';

export function createSlashCommandPlugin() {
  return {
    name: 'slashCommand',
    _editor: null,
    _popup: null,
    _triggerNode: null,   // the text node currently holding "/query"
    _triggerLen: 0,       // length of "/query" to delete on pick (1 + query.length)

    install(editor) {
      this._editor = editor;
      const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
      if (!doc) return;
      injectCaretPopupStyles(doc);

      this._popup = createCaretPopup(doc, {
        ariaLabel: 'Insert block or apply format',
        onPick: (item) => this._applyPick(item),
      });

      this._onInput = () => this._checkTrigger();
      this._onSelectionChange = () => {
        // Any selection change NOT caused by our own typing (click elsewhere,
        // arrow keys moving off the trigger) should close the palette.
        if (this._popup.isOpen() && !this._isCaretStillInTrigger()) this._close();
      };
      editor.on('input', this._onInput);
      editor.on('selectionChange', this._onSelectionChange);
    },

    destroy() {
      const editor = this._editor;
      if (editor) {
        editor.off('input', this._onInput);
        editor.off('selectionChange', this._onSelectionChange);
      }
      if (this._popup) this._popup.destroy();
      this._popup = null;
      this._triggerNode = null;
      this._editor = null;
    },

    // Consumed BEFORE block-editing's own Enter/Backspace handling when the
    // palette is open, so Enter picks an item instead of splitting the block,
    // and ArrowUp/Down navigate the list instead of moving the caret.
    onKeyDown(e) {
      if (!this._popup || !this._popup.isOpen()) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); this._popup.moveActive(1); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._popup.moveActive(-1); return true; }
      if (e.key === 'Enter')     { e.preventDefault(); this._popup.pickActive(); return true; }
      if (e.key === 'Escape')    { e.preventDefault(); this._close(); return true; }
      return false;
    },

    _checkTrigger() {
      const editor = this._editor;
      if (!editor || !editor.selection) return;
      const info = editor.selection.get();
      if (!info || !info.collapsed || !info.startNode) { this._close(); return; }
      const block = getParentBlock(info.startNode, editor.getEditorElement());
      const trigger = detectSlashTrigger(block, info.startNode, info.startOffset);
      if (!trigger) { this._close(); return; }

      this._triggerNode = info.startNode;
      this._triggerLen = 1 + trigger.query.length;
      const items = filterSlashCommands(trigger.query).filter((entry) => {
        // ACTION entries (image/table/link) are available iff the owning
        // plugin's toolbar button is actually present (installed + granted) —
        // picking them clicks that button, so no button = don't advertise it.
        if (entry.action) return !!this._findActionButton(entry.action);
        if (!(editor.commands && typeof editor.commands.get === 'function' && editor.commands.get(entry.command))) return false;
        // Feature gating (Phase 2.5): drop slash entries whose feature isn't
        // granted (execute would refuse them anyway; don't advertise them).
        const featureId = featureForCommand(entry.command);
        if (featureId && editor.isFeatureGranted && !editor.isFeatureGranted(featureId)) return false;
        return true;
      });
      if (!this._popup.isOpen()) {
        const range = document.createRange();
        range.setStart(info.startNode, info.startOffset);
        range.collapse(true);
        this._popup.open(range, items);
      } else {
        this._popup.setItems(items);
      }
    },

    _isCaretStillInTrigger() {
      const editor = this._editor;
      if (!editor || !editor.selection || !this._triggerNode) return false;
      const info = editor.selection.get();
      return !!(info && info.startNode === this._triggerNode);
    },

    _applyPick(entry) {
      const editor = this._editor;
      if (!editor || !this._triggerNode) return;
      // Delete the "/query" text so the command applies to a clean block.
      const node = this._triggerNode;
      const len = Math.min(this._triggerLen, node.nodeValue.length);
      node.nodeValue = node.nodeValue.slice(len);
      const range = document.createRange();
      range.setStart(node, 0);
      range.collapse(true);
      const win = (node.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
      if (win) {
        const sel = win.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      this._close();
      if (entry.action) {
        // The caret is now clean where "/query" was; activating the plugin's
        // toolbar button opens its insert dialog at that caret — same code path
        // a real button click uses, so no coupling to plugin internals.
        const btn = this._findActionButton(entry.action);
        if (btn) btn.click();
      } else if (editor.commands) {
        if (entry.arg !== undefined) editor.commands.execute(entry.command, entry.arg);
        else editor.commands.execute(entry.command);
      }
      if (editor._onChangeFn) editor._onChangeFn();
    },

    /** Locate a plugin's toolbar button by its `name` (data-name), so an ACTION
     *  slash entry can trigger the exact flow a click would. Null if absent
     *  (plugin not installed, feature denied, or no toolbar in this config). */
    _findActionButton(name) {
      const editor = this._editor;
      const root = editor && editor.getContainer && editor.getContainer();
      if (!root || typeof root.querySelector !== 'function') return null;
      return root.querySelector(`.oe-tb__btn[data-name="${name}"]`);
    },

    _close() {
      if (this._popup) this._popup.close();
      this._triggerNode = null;
      this._triggerLen = 0;
    },
  };
}

export const slashCommandPlugin = createSlashCommandPlugin();
