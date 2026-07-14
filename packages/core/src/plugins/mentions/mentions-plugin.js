/**
 * mentions-plugin.js — Phase 16.6.3: typing "@" opens a searchable autocomplete
 * (config.mentions.source) and inserts a non-editable mention node.
 *
 * Reuses the Stage-0 caret-anchored popup (16.6.1's shared infra) and the
 * link-boundary safety helper already proven by the emoji/special-chars
 * plugins. Moved here from the Phase 19 premium list — see README 16.6.3.
 *
 * Implements { name, install, destroy }.
 */
import { createCaretPopup } from '../../ui/caret-popup.js';
import { injectCaretPopupStyles } from '../../ui/caret-popup-styles.js';
import { injectMentionStyles } from './mention-styles.js';
import { createMentionNode } from './mention-dom.js';
import { detectMentionTrigger } from './mention-detect.js';
import { escapeLinkBoundary } from '../chars/char-insert-utils.js';
import { debounce } from '../../utils/debounce.js';

const DEBOUNCE_MS = 150;

export function createMentionsPlugin() {
  return {
    name: 'mentions',
    _editor: null,
    _popup: null,
    _triggerNode: null,
    _triggerLen: 0,
    _queryId: 0, // guards against a stale async source() response overwriting a newer query

    install(editor) {
      this._editor = editor;
      const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
      if (!doc) return;
      injectCaretPopupStyles(doc);
      injectMentionStyles(doc);

      this._popup = createCaretPopup(doc, {
        ariaLabel: 'Mention suggestions',
        renderItem: (item) => '@' + (item.label || item.id || ''),
        onPick: (item) => this._applyPick(item),
      });

      this._runQuery = debounce((query) => this._fetchAndShow(query), DEBOUNCE_MS);
      this._onInput = () => this._check();
      this._onSelectionChange = () => {
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
      if (this._runQuery && this._runQuery.cancel) this._runQuery.cancel();
      if (this._popup) this._popup.destroy();
      this._popup = null;
      this._triggerNode = null;
      this._editor = null;
    },

    onKeyDown(e) {
      if (!this._popup || !this._popup.isOpen()) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); this._popup.moveActive(1); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._popup.moveActive(-1); return true; }
      if (e.key === 'Enter')     { e.preventDefault(); this._popup.pickActive(); return true; }
      if (e.key === 'Escape')    { e.preventDefault(); this._close(); return true; }
      return false;
    },

    _check() {
      const editor = this._editor;
      if (!editor || !editor.selection) return;
      const info = editor.selection.get();
      if (!info || !info.collapsed || !info.startNode) { this._close(); return; }
      const trigger = detectMentionTrigger(info.startNode, info.startOffset);
      if (!trigger) { this._close(); return; }

      this._triggerNode = info.startNode;
      this._triggerAtIndex = trigger.atIndex;
      this._triggerLen = 1 + trigger.query.length;

      if (!this._popup.isOpen()) {
        const range = document.createRange();
        range.setStart(info.startNode, info.startOffset);
        range.collapse(true);
        this._popup.open(range, []);
      }
      this._runQuery(trigger.query);
    },

    _fetchAndShow(query) {
      const editor = this._editor;
      const cfg = editor && editor._config && editor._config.mentions;
      if (!cfg || typeof cfg.source !== 'function') { if (this._popup) this._popup.setItems([]); return; }
      const myQueryId = ++this._queryId;
      Promise.resolve(cfg.source(query))
        .then((items) => {
          // A newer query started while this one was in flight — drop this result.
          if (myQueryId !== this._queryId || !this._popup || !this._popup.isOpen()) return;
          this._popup.setItems(Array.isArray(items) ? items : []);
        })
        .catch(() => { if (myQueryId === this._queryId && this._popup) this._popup.setItems([]); });
    },

    _isCaretStillInTrigger() {
      const editor = this._editor;
      if (!editor || !editor.selection || !this._triggerNode) return false;
      const info = editor.selection.get();
      return !!(info && info.startNode === this._triggerNode);
    },

    _applyPick(item) {
      const editor = this._editor;
      if (!editor || !this._triggerNode) return;
      const node = this._triggerNode;
      const doc = node.ownerDocument;
      const atIndex = this._triggerAtIndex;
      const len = Math.min(this._triggerLen, node.nodeValue.length - atIndex);
      const tail = node.nodeValue.slice(atIndex + len);
      node.nodeValue = node.nodeValue.slice(0, atIndex);

      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const range = doc.createRange();
      range.setStart(node, node.nodeValue.length);
      range.collapse(true);
      if (win) { const sel = win.getSelection(); sel.removeAllRanges(); sel.addRange(range); }

      this._close();
      escapeLinkBoundary(editor); // never insert the mention inside a link boundary
      const mentionNode = createMentionNode(doc, item);
      editor.selection.insertAtCursor(mentionNode);
      // Restore whatever text followed the "@query" (usually empty) right after
      // the inserted node, with the caret placed after it — same as emoji/chars.
      if (tail) editor.selection.insertAtCursor(tail);
      if (editor._onChangeFn) editor._onChangeFn();
    },

    _close() {
      if (this._popup) this._popup.close();
      this._triggerNode = null;
      this._triggerLen = 0;
    },
  };
}

export const mentionsPlugin = createMentionsPlugin();
